import type { FastifyInstance } from "fastify";
import { expect } from "vitest";
import { SUBSCRIBER_QUEUES } from "../composition/queues";
import { createServices, type Services } from "../composition/services";
import { Argon2Hasher } from "../modules/identity";
import { parseEnv } from "../platform/config/env";
import type { Database } from "../platform/db/database";
import { runSubscriber } from "../platform/events/dispatcher";
import { buildApp } from "../platform/http/app";
import { createLogger } from "../platform/logger";
import { firstLink, MemoryMailer } from "../platform/mail/mailers";
import { MemoryFileStorage } from "../platform/storage/storage";
import { type MigratedDb, setupMigratedDb } from "./migratedDb";

/**
 * ARNÉS de integración HTTP: PostgreSQL real con todas las migraciones, los tres roles de BD, la app
 * completa (fastify.inject) con correo y almacenamiento en memoria, y un reloj controlable.
 * Lo usan los tests de integración de los módulos (CRM, Delivery…).
 */
export const PASSWORD = "caballo bateria grapa correcta";
export const ORIGIN = "http://localhost:5173";

export interface Session {
  accessToken: string;
  refreshCookie: string;
  tenantId: string;
  membershipId: string;
  userId: string;
  email: string;
}

export interface Harness {
  env: MigratedDb;
  database: Database;
  services: Services;
  app: FastifyInstance;
  mailer: MemoryMailer;
  storage: MemoryFileStorage;
  /** Reloj de la aplicación (se puede adelantar). */
  clock: { now: () => Date; set(d: Date): void };
  auth(s: { accessToken: string }): { authorization: string };
  signup(prefix?: string, company?: string): Promise<Session>;
  verifyEmail(s: Session): Promise<void>;
  /** Invita y acepta con cuenta nueva; devuelve la sesión del miembro. */
  addMember(owner: Session, role: string, seatType?: string): Promise<Session>;
  /** Ejecuta los suscriptores sobre el outbox pendiente, como haría el worker. */
  drainOutbox(): Promise<void>;
  /** Eventos publicados (en el outbox) de un tenant, por tipo. */
  events(
    tenantId: string,
    type?: string,
  ): Promise<Array<{ type: string; payload: Record<string, unknown>; entity_id: string }>>;
  stop(): Promise<void>;
}

let counter = 0;
export const uniq = (p: string) => `${p}${++counter}${Date.now().toString(36)}`;
const tokenFrom = (link: string | undefined) =>
  new URL(link ?? "http://x/?token=").searchParams.get("token") ?? "";
const cookieOf = (res: { cookies: Array<{ name: string; value: string }> }, name = "nexo_rt") =>
  res.cookies.find((c) => c.name === name)?.value ?? "";

export async function createHarness(): Promise<Harness> {
  const env = await setupMigratedDb({ queues: SUBSCRIBER_QUEUES });
  const database = env.database();
  let current = new Date("2026-10-10T10:00:00.000Z");
  const clock = {
    now: () => current,
    set: (d: Date) => {
      current = d;
    },
  };
  const mailer = new MemoryMailer();
  const storage = new MemoryFileStorage();
  const config = parseEnv({
    NODE_ENV: "test",
    DATABASE_URL_APP: env.raw.appUrl,
    DATABASE_URL_PLATFORM: env.raw.platformUrl,
    JWT_SIGNING_KEYS: "k1:0123456789abcdef0123456789abcdef0123",
    NEXO_PUBLIC_URL: ORIGIN,
  });
  const logger = createLogger((process.env.TEST_LOG as "silent" | undefined) ?? "silent");
  const services = createServices({
    env: config,
    logger,
    database,
    clock,
    mailer,
    storage,
    hasher: new Argon2Hasher({ memoryCost: 1024, timeCost: 1 }),
  });
  const app = await buildApp({ env: config, logger, database, rateLimit: false });
  services.registerRoutes(app);
  await app.ready();

  const auth = (s: { accessToken: string }) => ({ authorization: `Bearer ${s.accessToken}` });

  async function drainOutbox() {
    const { rows } = await env.raw.ownerPool.query(
      "select id, tenant_id, type, version from outbox_events where status = 'pending' order by occurred_at",
    );
    for (const row of rows) {
      for (const sub of services.registry.forEvent(row.type, row.version)) {
        await runSubscriber(database, sub, { tenantId: row.tenant_id, eventId: row.id }, logger);
      }
      await env.raw.ownerPool.query(
        "update outbox_events set status = 'dispatched' where id = $1",
        [row.id],
      );
    }
  }

  async function signup(
    prefix = uniq("owner"),
    company = `Empresa ${uniq("c")}`,
  ): Promise<Session> {
    const email = `${prefix}@example.com`;
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/signup",
      payload: {
        email,
        password: PASSWORD,
        fullName: "Persona Prueba",
        companyName: company,
        countryCode: "ES",
        acceptTerms: true,
      },
    });
    expect(res.statusCode, res.body).toBe(201);
    const b = res.json();
    return {
      accessToken: b.accessToken,
      refreshCookie: cookieOf(res),
      tenantId: b.tenant.id,
      membershipId: b.membership.id,
      userId: b.user.id,
      email,
    };
  }

  async function verifyEmail(s: Session) {
    await drainOutbox();
    const token = tokenFrom(firstLink(mailer.last(s.email)?.text ?? ""));
    expect(token, "debe haber un correo de verificación").not.toBe("");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token },
    });
    expect(res.statusCode).toBe(204);
  }

  async function addMember(owner: Session, role: string, seatType = "full"): Promise<Session> {
    const email = `${uniq("miembro")}@example.com`;
    const inv = await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: auth(owner),
      payload: { email, role, seatType },
    });
    expect(inv.statusCode, inv.body).toBe(201);
    const token = tokenFrom(firstLink(mailer.last(email)?.text ?? ""));
    const acc = await app.inject({
      method: "POST",
      url: "/api/v1/auth/accept-invitation",
      payload: { token, fullName: "Miembro Prueba", password: PASSWORD },
    });
    expect(acc.statusCode, acc.body).toBe(201);
    const b = acc.json();
    return {
      accessToken: b.accessToken,
      refreshCookie: cookieOf(acc),
      tenantId: b.tenant.id,
      membershipId: b.membership.id,
      userId: b.user.id,
      email,
    };
  }

  async function events(tenantId: string, type?: string) {
    const { rows } = await env.raw.ownerPool.query(
      `select type, payload, entity_id from outbox_events where tenant_id = $1 ${type ? "and type = $2" : ""} order by occurred_at, id`,
      type ? [tenantId, type] : [tenantId],
    );
    return rows;
  }

  return {
    env,
    database,
    services,
    app,
    mailer,
    storage,
    clock,
    auth,
    signup,
    verifyEmail,
    addMember,
    drainOutbox,
    events,
    async stop() {
      await app.close();
      await env.stop();
    },
  };
}
