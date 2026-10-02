import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type MigratedDb, setupMigratedDb } from "../../testing/migratedDb";
import { publishEvent } from "../events/outbox";
import type { Database } from "./database";
import { withPlatform } from "./platform";
import { outboxEvents, tenants } from "./schema";

let env: MigratedDb;
let db: Database;
let tenantA: string;

beforeAll(async () => {
  env = await setupMigratedDb();
  db = env.database();
  const [a] = await withPlatform(db, "test: crear tenant", (tx) =>
    tx.insert(tenants).values({ slug: "acme", name: "Acme" }).returning({ id: tenants.id }),
  );
  tenantA = a?.id as string;
});

afterAll(async () => {
  await env?.stop();
});

const event = (tenantId: string) => ({
  id: randomUUID(),
  type: "crm.deal.won",
  version: 1,
  tenantId,
  occurredAt: new Date().toISOString(),
  actor: { membershipId: null, source: "system" as const },
  entity: { type: "deal", id: randomUUID() },
  payload: { dealId: "d1" },
});

describe("migraciones y roles", () => {
  it("crea nexo_app sin BYPASSRLS y nexo_platform con BYPASSRLS", async () => {
    const { rows } = await env.raw.ownerPool.query(
      "select rolname, rolbypassrls, rolsuper from pg_roles where rolname in ('nexo_app','nexo_platform') order by rolname",
    );
    expect(rows).toEqual([
      { rolname: "nexo_app", rolbypassrls: false, rolsuper: false },
      { rolname: "nexo_platform", rolbypassrls: true, rolsuper: false },
    ]);
  });

  it("tiene las extensiones necesarias y uuidv7() disponible", async () => {
    const ext = await env.raw.ownerPool.query(
      "select extname from pg_extension where extname in ('pg_trgm','unaccent','pgcrypto')",
    );
    expect(ext.rows.length).toBe(3);
    const id = await env.raw.ownerPool.query("select uuidv7() as id");
    expect(id.rows[0].id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("Database.withTenant", () => {
  it("fija el tenant activo SOLO durante la transacción", async () => {
    const inside = await db.withTenant({ tenantId: tenantA }, async (tx) => {
      const r = await tx.execute(sql`select current_setting('app.tenant_id', true) as t`);
      return r.rows[0]?.t;
    });
    expect(inside).toBe(tenantA);
  });

  it("no filtra el tenant a la siguiente petición que reutiliza la misma conexión", async () => {
    const single = env.database({ maxConnections: 1 });
    await single.withTenant({ tenantId: tenantA }, async () => undefined);
    // Segunda "petición" sobre la misma (única) conexión del pool, sin contexto.
    const leaked = await single.withTenant({ tenantId: randomUUID() }, async (tx) => {
      const r = await tx.execute(sql`select current_setting('app.tenant_id', true) as t`);
      return r.rows[0]?.t;
    });
    expect(leaked).not.toBe(tenantA);
  });

  it("rechaza un tenantId que no sea UUID antes de tocar la base de datos", async () => {
    await expect(
      db.withTenant({ tenantId: "x'; drop table tenants;--" }, async () => 1),
    ).rejects.toThrow(/UUID/);
  });

  it("hace rollback completo si el caso de uso falla", async () => {
    const e = event(tenantA);
    await expect(
      db.withTenant({ tenantId: tenantA }, async (tx) => {
        await publishEvent(tx, e);
        throw new Error("fallo del caso de uso");
      }),
    ).rejects.toThrow("fallo del caso de uso");
    const rows = await db.withTenant({ tenantId: tenantA }, (tx) => tx.select().from(outboxEvents));
    expect(rows.find((r) => r.id === e.id)).toBeUndefined();
  });
});

describe("publishEvent (outbox)", () => {
  it("inserta el evento en la misma transacción y queda pendiente", async () => {
    const e = event(tenantA);
    await db.withTenant({ tenantId: tenantA }, (tx) => publishEvent(tx, e));
    const rows = await db.withTenant({ tenantId: tenantA }, (tx) => tx.select().from(outboxEvents));
    const saved = rows.find((r) => r.id === e.id);
    expect(saved).toMatchObject({
      type: "crm.deal.won",
      version: 1,
      status: "pending",
      attempts: 0,
    });
  });

  it("valida el sobre del evento (tipo mal formado)", async () => {
    const bad = { ...event(tenantA), type: "NoValido" };
    await expect(
      db.withTenant({ tenantId: tenantA }, (tx) => publishEvent(tx, bad)),
    ).rejects.toThrow();
  });

  it("no permite publicar un evento de OTRO tenant desde el contexto actual", async () => {
    const [b] = await withPlatform(db, "test: segundo tenant", (tx) =>
      tx.insert(tenants).values({ slug: "globex", name: "Globex" }).returning({ id: tenants.id }),
    );
    const foreign = event(b?.id as string);
    await expect(
      db.withTenant({ tenantId: tenantA }, (tx) => publishEvent(tx, foreign)),
    ).rejects.toThrow();
  });
});
