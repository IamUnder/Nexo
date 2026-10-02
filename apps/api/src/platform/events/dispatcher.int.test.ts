import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { type MigratedDb, setupMigratedDb } from "../../testing/migratedDb";
import type { Database } from "../db/database";
import { withPlatform } from "../db/platform";
import { tenants } from "../db/schema";
import { uuidv7 } from "../ids";
import { createLogger } from "../logger";
import { createBoss, queueNamesFor } from "../queue/boss";
import { dispatchPending, runSubscriber, startSubscribers } from "./dispatcher";
import { publishEvent } from "./outbox";
import { SubscriberRegistry } from "./subscribers";

const logger = createLogger("silent");
let env: MigratedDb;
let db: Database;
let A: string;
let B: string;
const seen: Array<{ tenant: string | undefined; deal: string }> = [];
let failuresLeft = 0;

const registry = new SubscriberRegistry().register({
  name: "test.deal_won",
  eventType: "crm.deal.won",
  version: 1,
  payloadSchema: z.object({ dealId: z.string() }),
  async handle({ tx, ctx, event }) {
    if (failuresLeft > 0) {
      failuresLeft--;
      throw new Error("fallo transitorio");
    }
    const r = await tx.execute(
      // el handler corre con el contexto de tenant fijado por withTenant
      (await import("drizzle-orm")).sql`select current_setting('app.tenant_id', true) as t`,
    );
    seen.push({ tenant: r.rows[0]?.t as string | undefined, deal: event.payload.dealId });
    expect(ctx.tenantId).toBe(event.tenantId);
  },
});

const event = (tenantId: string, dealId: string) => ({
  id: uuidv7(),
  type: "crm.deal.won",
  version: 1,
  tenantId,
  occurredAt: new Date().toISOString(),
  actor: { membershipId: null, source: "system" as const },
  entity: { type: "deal", id: uuidv7() },
  payload: { dealId },
});

beforeAll(async () => {
  env = await setupMigratedDb({ queues: queueNamesFor(registry) });
  db = env.database();
  const rows = await withPlatform(db, "test", (tx) =>
    tx
      .insert(tenants)
      .values([
        { slug: "alfa", name: "Alfa" },
        { slug: "beta", name: "Beta" },
      ])
      .returning({ id: tenants.id, slug: tenants.slug }),
  );
  A = rows.find((r) => r.slug === "alfa")?.id as string;
  B = rows.find((r) => r.slug === "beta")?.id as string;
});

afterAll(async () => {
  await env?.stop();
});

describe("runSubscriber (idempotencia y aislamiento)", () => {
  it("procesa una vez y las repeticiones se omiten", async () => {
    const e = event(A, "d-idem");
    await db.withTenant({ tenantId: A }, (tx) => publishEvent(tx, e));
    const sub = registry.all()[0];
    if (!sub) throw new Error("sin suscriptor");
    const before = seen.length;
    expect(await runSubscriber(db, sub, { tenantId: A, eventId: e.id }, logger)).toBe("processed");
    expect(await runSubscriber(db, sub, { tenantId: A, eventId: e.id }, logger)).toBe("skipped");
    expect(seen.length).toBe(before + 1);
    expect(seen.at(-1)).toEqual({ tenant: A, deal: "d-idem" });
  });

  it("un job con el tenant equivocado NO ve ni procesa el evento de otro tenant", async () => {
    const e = event(B, "d-cruzado");
    await db.withTenant({ tenantId: B }, (tx) => publishEvent(tx, e));
    const sub = registry.all()[0];
    if (!sub) throw new Error("sin suscriptor");
    const before = seen.length;
    expect(await runSubscriber(db, sub, { tenantId: A, eventId: e.id }, logger)).toBe("skipped");
    expect(seen.length).toBe(before);
  });

  it("si el handler falla, no se marca como procesado (se podrá reintentar)", async () => {
    const e = event(A, "d-retry");
    await db.withTenant({ tenantId: A }, (tx) => publishEvent(tx, e));
    const sub = registry.all()[0];
    if (!sub) throw new Error("sin suscriptor");
    failuresLeft = 1;
    await expect(runSubscriber(db, sub, { tenantId: A, eventId: e.id }, logger)).rejects.toThrow(
      "fallo transitorio",
    );
    expect(await runSubscriber(db, sub, { tenantId: A, eventId: e.id }, logger)).toBe("processed");
  });
});

describe("dispatcher + pg-boss de extremo a extremo", () => {
  it("despacha el outbox y el worker ejecuta el handler en el tenant correcto", async () => {
    const boss = createBoss(env.raw.platformUrl, { schedule: false });
    boss.on("error", () => undefined);
    await boss.start();
    try {
      await startSubscribers({ database: db, boss, registry, logger });
      const before = seen.length;
      const eA = event(A, "d-e2e-a");
      const eB = event(B, "d-e2e-b");
      await db.withTenant({ tenantId: A }, (tx) => publishEvent(tx, eA));
      await db.withTenant({ tenantId: B }, (tx) => publishEvent(tx, eB));

      const dispatched = await dispatchPending(db, boss, registry);
      expect(dispatched).toBeGreaterThanOrEqual(2);

      // Se buscan SUS entradas (puede haber otros eventos pendientes de tests anteriores).
      await expect
        .poll(() => seen.slice(before).map((s) => s.deal), { timeout: 30_000, interval: 250 })
        .toEqual(expect.arrayContaining(["d-e2e-a", "d-e2e-b"]));
      const mine = seen.slice(before);
      expect(mine).toContainEqual({ tenant: A, deal: "d-e2e-a" });
      expect(mine).toContainEqual({ tenant: B, deal: "d-e2e-b" });

      // Nada pendiente tras despachar.
      expect(await dispatchPending(db, boss, registry)).toBe(0);
    } finally {
      await boss.stop({ graceful: true });
    }
  });

  it("los eventos sin suscriptores se marcan como despachados (no se acumulan)", async () => {
    const boss = createBoss(env.raw.platformUrl);
    boss.on("error", () => undefined);
    await boss.start();
    try {
      const e = { ...event(A, "x"), type: "crm.deal.lost" };
      await db.withTenant({ tenantId: A }, (tx) => publishEvent(tx, e));
      await dispatchPending(db, boss, registry);
      const { rows } = await env.raw.ownerPool.query(
        "select status from outbox_events where id = $1",
        [e.id],
      );
      expect(rows[0].status).toBe("dispatched");
    } finally {
      await boss.stop({ graceful: true });
    }
  });
});

describe("SubscriberRegistry", () => {
  it("rechaza nombres duplicados o inválidos", () => {
    const r = new SubscriberRegistry();
    const base = {
      eventType: "a.b.c",
      version: 1,
      payloadSchema: z.unknown(),
      handle: async () => undefined,
    };
    r.register({ ...base, name: "mod.uno" });
    expect(() => r.register({ ...base, name: "mod.uno" })).toThrow(/duplicado/);
    expect(() => r.register({ ...base, name: "Mal Nombre" })).toThrow(/no válido/);
  });
});
