import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Argon2Hasher } from "../modules/identity";
import { parseEnv } from "../platform/config/env";
import type { Database } from "../platform/db/database";
import { runSubscriber } from "../platform/events/dispatcher";
import { buildApp } from "../platform/http/app";
import { createLogger } from "../platform/logger";
import { firstLink, MemoryMailer } from "../platform/mail/mailers";
import { MemoryFileStorage } from "../platform/storage/storage";
import { type MigratedDb, setupMigratedDb } from "../testing/migratedDb";
import { SUBSCRIBER_QUEUES } from "./queues";
import { createServices, type Services } from "./services";

/**
 * PLATFORM CORE de extremo a extremo (hito 1): HTTP real (fastify.inject) contra PostgreSQL real, con
 * los tres roles de BD, RLS, guards, eventos y correo. Cubre los criterios de aceptación de
 * MODULES_SPEC §2.8 (aislamiento total entre tenants, alta, sesión, bloqueo, auditoría).
 */
const PASSWORD = "caballo bateria grapa correcta";
const ORIGIN = "http://localhost:5173";

let env: MigratedDb;
let database: Database;
let services: Services;
let app: FastifyInstance;
const mailer = new MemoryMailer();
const storage = new MemoryFileStorage();
let now = new Date("2026-10-10T10:00:00.000Z");
const clock = { now: () => now };
let counter = 0;
const uniq = (p: string) => `${p}${++counter}`;

beforeAll(async () => {
  env = await setupMigratedDb({ queues: SUBSCRIBER_QUEUES });
  database = env.database();
  const config = parseEnv({
    NODE_ENV: "test",
    DATABASE_URL_APP: env.raw.appUrl,
    DATABASE_URL_PLATFORM: env.raw.platformUrl,
    JWT_SIGNING_KEYS: "k1:0123456789abcdef0123456789abcdef0123",
    NEXO_PUBLIC_URL: ORIGIN,
  });
  const logger = createLogger("silent");
  services = createServices({
    env: config,
    logger,
    database,
    clock,
    mailer,
    storage,
    hasher: new Argon2Hasher({ memoryCost: 1024, timeCost: 1 }),
  });
  app = await buildApp({ env: config, logger, database, rateLimit: false });
  services.registerRoutes(app);
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await env?.stop();
});

beforeEach(() => {
  now = new Date("2026-10-10T10:00:00.000Z");
  mailer.clear();
});

// ── Utilidades ──────────────────────────────────────────────────────────────────────────────────
interface Session {
  accessToken: string;
  refreshCookie: string;
  tenantId: string;
  membershipId: string;
  userId: string;
  email: string;
}

const auth = (s: { accessToken: string }) => ({ authorization: `Bearer ${s.accessToken}` });
const refreshHeaders = (cookie: string) => ({
  cookie: `nexo_rt=${cookie}`,
  "x-nexo-csrf": "1",
  origin: ORIGIN,
});
const cookieOf = (res: { cookies: Array<{ name: string; value: string }> }, name = "nexo_rt") =>
  res.cookies.find((c) => c.name === name)?.value ?? "";

async function signup(
  emailPrefix = uniq("owner"),
  company = `Empresa ${counter}`,
): Promise<Session> {
  const email = `${emailPrefix}@example.com`;
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
  const body = res.json();
  return {
    accessToken: body.accessToken,
    refreshCookie: cookieOf(res),
    tenantId: body.tenant.id,
    membershipId: body.membership.id,
    userId: body.user.id,
    email,
  };
}

/** Procesa el outbox como lo haría el worker: ejecuta cada suscriptor sobre cada evento pendiente. */
async function drainOutbox() {
  const { rows } = await env.raw.ownerPool.query(
    "select id, tenant_id, type, version from outbox_events where status = 'pending' order by occurred_at",
  );
  for (const row of rows) {
    for (const sub of services.registry.forEvent(row.type, row.version)) {
      await runSubscriber(
        database,
        sub,
        { tenantId: row.tenant_id, eventId: row.id },
        createLogger("silent"),
      );
    }
    await env.raw.ownerPool.query("update outbox_events set status = 'dispatched' where id = $1", [
      row.id,
    ]);
  }
}

const tokenFrom = (link: string | undefined) =>
  new URL(link ?? "http://x/?token=").searchParams.get("token") ?? "";

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

async function login(email: string, password = PASSWORD) {
  return app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password } });
}

/** Invita, acepta con cuenta nueva y devuelve la sesión del miembro. */
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

// ── Alta y sesión ───────────────────────────────────────────────────────────────────────────────
describe("alta self-service", () => {
  it("crea tenant en prueba de 21 días, propietario con todos los permisos y sesión", async () => {
    const s = await signup();
    const me = await app.inject({ url: "/api/v1/session/me", headers: auth(s) });
    expect(me.statusCode).toBe(200);
    const body = me.json();
    expect(body.membership.role).toBe("owner");
    expect(body.tenant.status).toBe("trial");
    expect(new Date(body.tenant.trialEndsAt).getTime()).toBe(now.getTime() + 21 * 86_400_000);
    expect(body.permissions).toContain("identity:member:manage");
    expect(body.modules).toContain("crm");
    expect(body.user.emailVerified).toBe(false);
  });

  it("el refresh token va en cookie httpOnly + SameSite=Strict con ruta acotada", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/signup",
      payload: {
        email: `${uniq("c")}@example.com`,
        password: PASSWORD,
        fullName: "Ana Gil",
        companyName: "Cookie SL",
        acceptTerms: true,
      },
    });
    const cookie = res.cookies.find((c) => c.name === "nexo_rt");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Strict");
    expect(cookie?.path).toBe("/api/v1/auth");
    expect(res.json().refreshToken).toBeUndefined(); // nunca en el cuerpo
  });

  it("rechaza email ya registrado (409 account.exists)", async () => {
    const s = await signup();
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/signup",
      payload: {
        email: s.email,
        password: PASSWORD,
        fullName: "Otra",
        companyName: "Otra SL",
        acceptTerms: true,
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("account.exists");
  });

  it.each([
    ["corta1", "password.too_short"],
    ["Contraseña123", "password.weak"],
  ])("contraseña débil %s → 400", async (password) => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/signup",
      payload: {
        email: `${uniq("w")}@example.com`,
        password,
        fullName: "Ana Gil",
        companyName: "Débil SL",
        acceptTerms: true,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("exige aceptar los términos", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/signup",
      payload: {
        email: `${uniq("t")}@example.com`,
        password: PASSWORD,
        fullName: "Ana Gil",
        companyName: "Sin SL",
        acceptTerms: false,
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("dos empresas con el mismo nombre obtienen slugs distintos", async () => {
    const a = await signup(uniq("dup"), "Misma Empresa");
    const b = await signup(uniq("dup"), "Misma Empresa");
    const { rows } = await env.raw.ownerPool.query("select slug from tenants where id = any($1)", [
      [a.tenantId, b.tenantId],
    ]);
    expect(new Set(rows.map((r) => r.slug)).size).toBe(2);
  });

  it("verifica el email con el enlace enviado y el enlace no se puede reutilizar", async () => {
    const s = await signup();
    await drainOutbox();
    const token = tokenFrom(firstLink(mailer.last(s.email)?.text ?? ""));
    expect(
      await app.inject({ method: "POST", url: "/api/v1/auth/verify-email", payload: { token } }),
    ).toMatchObject({ statusCode: 204 });
    const again = await app.inject({
      method: "POST",
      url: "/api/v1/auth/verify-email",
      payload: { token },
    });
    expect(again.statusCode).toBe(400);
    const me = await app.inject({ url: "/api/v1/session/me", headers: auth(s) });
    expect(me.json().user.emailVerified).toBe(true);
  });

  it("deja constancia en auditoría y en el outbox", async () => {
    const s = await signup();
    const audit = await app.inject({ url: "/api/v1/audit", headers: auth(s) });
    expect(audit.json().items.map((i: { action: string }) => i.action)).toContain(
      "tenancy.tenant.created",
    );
    const { rows } = await env.raw.ownerPool.query(
      "select type from outbox_events where tenant_id = $1",
      [s.tenantId],
    );
    expect(rows.map((r) => r.type)).toContain("tenancy.tenant.created");
  });
});

describe("login, bloqueo y sesión", () => {
  it("login correcto devuelve sesión; las credenciales erróneas dan el mismo error exista o no el email", async () => {
    const s = await signup();
    expect((await login(s.email)).statusCode).toBe(200);
    const wrong = await login(s.email, "contraseña incorrecta!!");
    const unknown = await login("no-existe@example.com", "contraseña incorrecta!!");
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error.code).toBe("auth.invalid_credentials");
    expect(unknown.json().error.code).toBe("auth.invalid_credentials");
  });

  it("el email no distingue mayúsculas", async () => {
    const s = await signup();
    expect((await login(s.email.toUpperCase())).statusCode).toBe(200);
  });

  it("bloquea la cuenta tras 5 fallos (423 aun con la contraseña correcta) y se libera con el tiempo", async () => {
    const s = await signup();
    for (let i = 0; i < 5; i++)
      expect((await login(s.email, "contraseña incorrecta!!")).statusCode).toBe(401);
    const locked = await login(s.email);
    expect(locked.statusCode).toBe(423);
    expect(locked.json().error.code).toBe("auth.account_locked");
    now = new Date(now.getTime() + 16 * 60_000);
    expect((await login(s.email)).statusCode).toBe(200);
  });

  it("refresh rota el token; reutilizar uno ya rotado (pasada la tolerancia) revoca TODA la familia", async () => {
    const s = await signup();
    const r1 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: refreshHeaders(s.refreshCookie),
    });
    expect(r1.statusCode).toBe(200);
    const newCookie = cookieOf(r1);
    expect(newCookie).not.toBe(s.refreshCookie);

    now = new Date(now.getTime() + 11_000); // fuera de la ventana de tolerancia
    const reuse = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: refreshHeaders(s.refreshCookie),
    });
    expect(reuse.statusCode).toBe(401);
    // El token legítimo más reciente también queda revocado (se asume robo).
    const afterTheft = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: refreshHeaders(newCookie),
    });
    expect(afterTheft.statusCode).toBe(401);
  });

  it("tolera la carrera de una recarga durante el refresh: reutilizar el token en los primeros segundos NO cierra la sesión", async () => {
    const s = await signup();
    const r1 = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: refreshHeaders(s.refreshCookie),
    });
    expect(r1.statusCode).toBe(200);
    // La respuesta se «pierde» (recarga) y el navegador vuelve a presentar el token viejo 2 s después.
    now = new Date(now.getTime() + 2_000);
    const retry = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: refreshHeaders(s.refreshCookie),
    });
    expect(retry.statusCode, retry.body).toBe(200);
    expect(cookieOf(retry)).not.toBe("");
    const me = await app.inject({
      url: "/api/v1/session/me",
      headers: auth({ accessToken: retry.json().accessToken }),
    });
    expect(me.statusCode).toBe(200);
  });

  it("el refresh exige la cabecera anti-CSRF y el Origin permitido", async () => {
    const s = await signup();
    const noHeader = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: { cookie: `nexo_rt=${s.refreshCookie}` },
    });
    expect(noHeader.statusCode).toBe(401);
    const badOrigin = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: {
        cookie: `nexo_rt=${s.refreshCookie}`,
        "x-nexo-csrf": "1",
        origin: "https://evil.example",
      },
    });
    expect(badOrigin.statusCode).toBe(401);
  });

  it("logout revoca la sesión", async () => {
    const s = await signup();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/logout",
          headers: refreshHeaders(s.refreshCookie),
        })
      ).statusCode,
    ).toBe(204);
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      headers: refreshHeaders(s.refreshCookie),
    });
    expect(r.statusCode).toBe(401);
  });

  it("un access token caducado da auth.token_expired (el cliente debe refrescar)", async () => {
    const s = await signup();
    now = new Date(now.getTime() + 16 * 60_000);
    const res = await app.inject({ url: "/api/v1/session/me", headers: auth(s) });
    expect(res.statusCode).toBe(401);
    expect(res.json().error.code).toBe("auth.token_expired");
  });

  it("rechaza tokens manipulados, ausentes y de otro ámbito", async () => {
    const s = await signup();
    expect((await app.inject({ url: "/api/v1/session/me" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          url: "/api/v1/session/me",
          headers: { authorization: `Bearer ${s.accessToken}x` },
        })
      ).statusCode,
    ).toBe(401);
    expect((await app.inject({ url: "/api/v1/admin/tenants", headers: auth(s) })).statusCode).toBe(
      401,
    );
  });

  it("recuperar contraseña: enlace de un solo uso, cierra sesiones y no revela si existe el email", async () => {
    const s = await signup();
    const unknown = await app.inject({
      method: "POST",
      url: "/api/v1/auth/forgot-password",
      payload: { email: "nadie@example.com" },
    });
    expect(unknown.statusCode).toBe(202);
    expect(mailer.sent).toHaveLength(0);

    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/forgot-password",
          payload: { email: s.email },
        })
      ).statusCode,
    ).toBe(202);
    const token = tokenFrom(firstLink(mailer.last(s.email)?.text ?? ""));
    const weak = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, password: "Contraseña123" },
    });
    expect(weak.statusCode).toBe(400);

    const nueva = "otra frase larga y distinta 2026";
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/reset-password",
          payload: { token, password: nueva },
        })
      ).statusCode,
    ).toBe(204);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/reset-password",
          payload: { token, password: nueva },
        })
      ).statusCode,
    ).toBe(400);
    expect((await login(s.email)).statusCode).toBe(401);
    expect((await login(s.email, nueva)).statusCode).toBe(200);
    // La sesión anterior ya no se puede refrescar.
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/auth/refresh",
          headers: refreshHeaders(s.refreshCookie),
        })
      ).statusCode,
    ).toBe(401);
  });

  it("cambiar contraseña exige la actual, aplica la política y devuelve una sesión nueva", async () => {
    const s = await signup();
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: auth(s),
      payload: {
        currentPassword: "no es esta contraseña",
        newPassword: "otra frase larga y distinta 2026",
      },
    });
    expect(bad.statusCode).toBe(401);
    const ok = await app.inject({
      method: "POST",
      url: "/api/v1/auth/change-password",
      headers: auth(s),
      payload: { currentPassword: PASSWORD, newPassword: "otra frase larga y distinta 2026" },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().accessToken).toBeTruthy();
    expect((await login(s.email)).statusCode).toBe(401);
  });
});

// ── Equipo, invitaciones y permisos ───────────────────────────────────────────────────────────
describe("invitaciones y equipo", () => {
  it("invitar exige email verificado; luego el invitado acepta con cuenta nueva y entra con el rol indicado", async () => {
    const owner = await signup();
    const noVerified = await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: auth(owner),
      payload: { email: "nuevo@example.com", role: "sales", seatType: "full" },
    });
    expect(noVerified.statusCode).toBe(403);
    expect(noVerified.json().error.code).toBe("email.unverified");
    expect(mailer.sent).toHaveLength(0); // y no sale ningún correo

    await verifyEmail(owner);
    const verified = await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: auth(owner),
      payload: { email: "nuevo@example.com", role: "sales", seatType: "full" },
    });
    expect(verified.statusCode).toBe(201);
    expect(mailer.last("nuevo@example.com")?.subject).toContain("te invita");
  });

  it("flujo completo: invitar → aceptar → listar miembros → cambiar rol → suspender", async () => {
    const owner = await signup();
    await verifyEmail(owner);
    const member = await addMember(owner, "sales");

    const list = await app.inject({ url: "/api/v1/team/members", headers: auth(owner) });
    expect(
      list
        .json()
        .map((m: { role: string }) => m.role)
        .sort(),
    ).toEqual(["owner", "sales"]);

    const promote = await app.inject({
      method: "PATCH",
      url: `/api/v1/team/members/${member.membershipId}`,
      headers: auth(owner),
      payload: { role: "manager" },
    });
    expect(promote.statusCode).toBe(200);
    expect(promote.json().role).toBe("manager");

    // Suspendido: pierde el acceso AL INSTANTE aunque su access token siga vigente.
    expect(
      (await app.inject({ url: "/api/v1/team/members", headers: auth(member) })).statusCode,
    ).toBe(200);
    await app.inject({
      method: "PATCH",
      url: `/api/v1/team/members/${member.membershipId}`,
      headers: auth(owner),
      payload: { status: "suspended" },
    });
    expect(
      (await app.inject({ url: "/api/v1/team/members", headers: auth(member) })).statusCode,
    ).toBe(401);
    expect((await login(member.email)).statusCode).toBe(403);
  });

  it("rechaza invitar a un miembro existente o con invitación pendiente, y permite revocar", async () => {
    const owner = await signup();
    await verifyEmail(owner);
    const member = await addMember(owner, "viewer");
    const dupMember = await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: auth(owner),
      payload: { email: member.email, role: "sales", seatType: "full" },
    });
    expect(dupMember.statusCode).toBe(409);

    const email = `${uniq("p")}@example.com`;
    const inv = await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: auth(owner),
      payload: { email, role: "sales", seatType: "full" },
    });
    expect(inv.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/team/invitations",
          headers: auth(owner),
          payload: { email, role: "sales", seatType: "full" },
        })
      ).statusCode,
    ).toBe(409);

    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/team/invitations/${inv.json().id}`,
          headers: auth(owner),
        })
      ).statusCode,
    ).toBe(204);
    const token = tokenFrom(firstLink(mailer.last(email)?.text ?? ""));
    const acc = await app.inject({
      method: "POST",
      url: "/api/v1/auth/accept-invitation",
      payload: { token, fullName: "Tarde Tarde", password: PASSWORD },
    });
    expect(acc.statusCode).toBe(400);
    expect(acc.json().error.code).toBe("auth.invitation_invalid");
  });

  it("una invitación caducada no se puede aceptar", async () => {
    const owner = await signup();
    await verifyEmail(owner);
    const email = `${uniq("c")}@example.com`;
    await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: auth(owner),
      payload: { email, role: "sales", seatType: "full" },
    });
    const token = tokenFrom(firstLink(mailer.last(email)?.text ?? ""));
    now = new Date(now.getTime() + 8 * 86_400_000);
    const acc = await app.inject({
      method: "POST",
      url: "/api/v1/auth/accept-invitation",
      payload: { token, fullName: "Tarde Tarde", password: PASSWORD },
    });
    expect(acc.statusCode).toBe(400);
  });

  it("un usuario con cuenta existente que acepta otra invitación debe iniciar sesión y elige empresa", async () => {
    const a = await signup();
    await verifyEmail(a);
    const b = await signup();
    await verifyEmail(b);
    // b invita a a (que ya tiene cuenta en otra empresa)
    await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: auth(b),
      payload: { email: a.email, role: "sales", seatType: "full" },
    });
    const token = tokenFrom(firstLink(mailer.last(a.email)?.text ?? ""));
    const acc = await app.inject({
      method: "POST",
      url: "/api/v1/auth/accept-invitation",
      payload: { token },
    });
    expect(acc.statusCode).toBe(200);
    expect(acc.json()).toEqual({ kind: "accepted" });
    expect(acc.cookies).toHaveLength(0); // sin sesión: debe autenticarse

    const lg = await login(a.email);
    expect(lg.json().kind).toBe("selection");
    expect(lg.json().tenants).toHaveLength(2);
    const sel = await app.inject({
      method: "POST",
      url: "/api/v1/auth/select-tenant",
      payload: { selectionToken: lg.json().selectionToken, tenantId: b.tenantId },
    });
    expect(sel.statusCode).toBe(200);
    expect(sel.json().tenant.id).toBe(b.tenantId);
    expect(sel.json().membership.role).toBe("sales");

    // No se puede elegir una empresa de la que no se es miembro.
    const c = await signup();
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/auth/select-tenant",
      payload: { selectionToken: lg.json().selectionToken, tenantId: c.tenantId },
    });
    expect(bad.statusCode).toBe(403);
  });

  it("jerarquía: un admin no toca a un owner; nunca se deja el tenant sin owner; nadie cambia su propio rol", async () => {
    const owner = await signup();
    await verifyEmail(owner);
    const admin = await addMember(owner, "admin");
    const patch = (who: Session, target: string, payload: object) =>
      app.inject({
        method: "PATCH",
        url: `/api/v1/team/members/${target}`,
        headers: auth(who),
        payload,
      });

    expect((await patch(admin, owner.membershipId, { status: "suspended" })).statusCode).toBe(403);
    expect((await patch(owner, owner.membershipId, { role: "admin" })).statusCode).toBe(403); // propio rol
    const sole = await patch(admin, admin.membershipId, { role: "viewer" });
    expect(sole.statusCode).toBe(403);

    // Con un segundo owner sí se puede degradar a uno… pero no al último.
    const owner2 = await patch(owner, admin.membershipId, { role: "owner" });
    expect(owner2.statusCode).toBe(200);
    expect(
      (
        await patch({ ...owner, accessToken: owner.accessToken }, admin.membershipId, {
          role: "admin",
        })
      ).statusCode,
    ).toBe(200);
  });

  it("un asiento Light no puede tener rol de gestión ni invitar con él", async () => {
    const owner = await signup();
    await verifyEmail(owner);
    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: auth(owner),
      payload: { email: "x@example.com", role: "manager", seatType: "light" },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("member.seat_invalid");
  });

  it("los permisos se aplican por rol: un viewer no puede invitar ni gestionar", async () => {
    const owner = await signup();
    await verifyEmail(owner);
    const viewer = await addMember(owner, "viewer");
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: auth(viewer),
      payload: { email: "z@example.com", role: "viewer", seatType: "full" },
    });
    expect(res.statusCode).toBe(403);
    expect(
      (await app.inject({ url: "/api/v1/team/invitations", headers: auth(viewer) })).statusCode,
    ).toBe(403);
    expect((await app.inject({ url: "/api/v1/audit", headers: auth(viewer) })).statusCode).toBe(
      403,
    );
  });
});

describe("matriz de permisos por rol", () => {
  it("el admin del tenant concede y retira permisos a un rol, con efecto inmediato y auditado", async () => {
    const owner = await signup();
    await verifyEmail(owner);
    const sales = await addMember(owner, "sales");
    expect((await app.inject({ url: "/api/v1/audit", headers: auth(sales) })).statusCode).toBe(403);

    const grant = await app.inject({
      method: "PUT",
      url: "/api/v1/team/permissions/sales",
      headers: auth(owner),
      payload: { permissions: { "audit:log:read": true } },
    });
    expect(grant.statusCode).toBe(200);
    const row = grant.json().roles.find((r: { role: string }) => r.role === "sales");
    expect(
      row.permissions.find((p: { permission: string }) => p.permission === "audit:log:read"),
    ).toEqual({ permission: "audit:log:read", granted: true, source: "override" });
    expect((await app.inject({ url: "/api/v1/audit", headers: auth(sales) })).statusCode).toBe(200);

    // Volver al valor por defecto elimina el ajuste.
    await app.inject({
      method: "PUT",
      url: "/api/v1/team/permissions/sales",
      headers: auth(owner),
      payload: { permissions: { "audit:log:read": false } },
    });
    expect((await app.inject({ url: "/api/v1/audit", headers: auth(sales) })).statusCode).toBe(403);
    const { rows } = await env.raw.ownerPool.query(
      "select 1 from role_permission_overrides where tenant_id = $1 and role = 'sales'",
      [owner.tenantId],
    );
    expect(rows).toHaveLength(0);
  });

  it("los permisos del owner no se pueden tocar, y los ajustes de un tenant no afectan a otro", async () => {
    const t1 = await signup();
    await verifyEmail(t1);
    const t2 = await signup();
    await verifyEmail(t2);
    const s1 = await addMember(t1, "sales");
    const s2 = await addMember(t2, "sales");

    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/api/v1/team/permissions/owner",
          headers: auth(t1),
          payload: { permissions: { "audit:log:read": false } },
        })
      ).statusCode,
    ).toBe(403);

    await app.inject({
      method: "PUT",
      url: "/api/v1/team/permissions/sales",
      headers: auth(t1),
      payload: { permissions: { "audit:log:read": true } },
    });
    expect((await app.inject({ url: "/api/v1/audit", headers: auth(s1) })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/v1/audit", headers: auth(s2) })).statusCode).toBe(403); // el otro tenant sigue con el valor por defecto
  });

  it("un asiento Light nunca obtiene permisos de escritura, aunque el tenant se los conceda", async () => {
    const owner = await signup();
    await verifyEmail(owner);
    const light = await addMember(owner, "viewer", "light");
    await app.inject({
      method: "PUT",
      url: "/api/v1/team/permissions/viewer",
      headers: auth(owner),
      payload: { permissions: { "files:file:create": true } },
    });
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/files/uploads",
      headers: auth(light),
      payload: { filename: "a.pdf", contentType: "application/pdf", sizeBytes: 100 },
    });
    expect(res.statusCode).toBe(403);
  });
});

// ── AISLAMIENTO ENTRE TENANTS a través de la API ────────────────────────────────────────────────
describe("aislamiento total entre tenants (criterio de aceptación del Core)", () => {
  it("un usuario de A no ve miembros, invitaciones, auditoría ni archivos de B, ni los toca por id", async () => {
    const a = await signup();
    await verifyEmail(a);
    const b = await signup();
    await verifyEmail(b);
    const bMember = await addMember(b, "sales");

    const bInvEmail = `${uniq("inv")}@example.com`;
    const bInv = await app.inject({
      method: "POST",
      url: "/api/v1/team/invitations",
      headers: auth(b),
      payload: { email: bInvEmail, role: "sales", seatType: "full" },
    });

    const up = await app.inject({
      method: "POST",
      url: "/api/v1/files/uploads",
      headers: auth(b),
      payload: { filename: "secreto.pdf", contentType: "application/pdf", sizeBytes: 500 },
    });
    const fileId = up.json().fileId;
    const key = [...(storage as unknown as { objects: Map<string, unknown> }).objects.keys()];
    void key;
    const { rows: fr } = await env.raw.ownerPool.query(
      "select storage_key from files where id = $1",
      [fileId],
    );
    storage.simulateUpload(fr[0].storage_key, 500, "application/pdf");
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/files/${fileId}/confirm`,
          headers: auth(b),
        })
      ).statusCode,
    ).toBe(200);

    // Listados: solo lo propio.
    const members = (await app.inject({ url: "/api/v1/team/members", headers: auth(a) })).json();
    expect(members).toHaveLength(1);
    expect(members.every((m: { email: string }) => m.email === a.email)).toBe(true);
    expect(
      (await app.inject({ url: "/api/v1/team/invitations", headers: auth(a) })).json(),
    ).toHaveLength(0);
    expect((await app.inject({ url: "/api/v1/files", headers: auth(a) })).json()).toHaveLength(0);
    const audit = (await app.inject({ url: "/api/v1/audit?limit=100", headers: auth(a) })).json();
    expect(
      audit.items.every(
        (i: { actorMembershipId: string | null }) => i.actorMembershipId !== bMember.membershipId,
      ),
    ).toBe(true);

    // Acceso directo por id: 404 (nunca 403, que revelaría la existencia).
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/team/members/${bMember.membershipId}`,
          headers: auth(a),
          payload: { role: "admin" },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/team/invitations/${bInv.json().id}`,
          headers: auth(a),
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ url: `/api/v1/files/${fileId}/download`, headers: auth(a) })).statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: "DELETE", url: `/api/v1/files/${fileId}`, headers: auth(a) }))
        .statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/files/${fileId}/confirm`,
          headers: auth(a),
        })
      ).statusCode,
    ).toBe(404);

    // Y B sigue viendo lo suyo intacto.
    expect(
      (await app.inject({ url: `/api/v1/files/${fileId}/download`, headers: auth(b) })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ url: "/api/v1/team/members", headers: auth(b) })).json(),
    ).toHaveLength(2);
  });

  it("un usuario no puede acceder a un tenant ajeno con un token fabricado con otro tenant", async () => {
    const a = await signup();
    const b = await signup();
    // Token válido de A, pero con la membresía de B (mid de B, tid de A): la membresía no pertenece al tenant.
    const forged = await services.identity.auth.issueForMembership({
      userId: a.userId,
      membershipId: b.membershipId,
    });
    const res = await app.inject({ url: "/api/v1/team/members", headers: auth(forged.body) });
    expect(res.statusCode).toBe(401);
  });

  it("los ajustes del tenant (nombre, moneda…) solo afectan al propio tenant", async () => {
    const a = await signup();
    const b = await signup();
    const upd = await app.inject({
      method: "PATCH",
      url: "/api/v1/tenant",
      headers: auth(a),
      payload: { name: "Nuevo Nombre SL", currency: "usd" },
    });
    expect(upd.statusCode).toBe(200);
    expect(upd.json().name).toBe("Nuevo Nombre SL");
    expect(upd.json().currency).toBe("USD");
    const other = await app.inject({ url: "/api/v1/tenant", headers: auth(b) });
    expect(other.json().name).not.toBe("Nuevo Nombre SL");
  });
});

// ── Estado del tenant ─────────────────────────────────────────────────────────────────────────
describe("prueba caducada y estados del tenant", () => {
  it("una prueba caducada bloquea de verdad (402) salvo lo que debe seguir accesible", async () => {
    const s = await signup();
    expect((await app.inject({ url: "/api/v1/team/members", headers: auth(s) })).statusCode).toBe(
      200,
    );

    now = new Date(now.getTime() + 22 * 86_400_000);
    // Tras 22 días caducaron el access token y el refresh (7 d): vuelve a iniciar sesión, que sigue permitido.
    const lg = await login(s.email);
    expect(lg.statusCode).toBe(200);
    const fresh = { accessToken: lg.json().accessToken };

    const blocked = await app.inject({ url: "/api/v1/team/members", headers: auth(fresh) });
    expect(blocked.statusCode).toBe(402);
    expect(blocked.json().error.code).toBe("tenant.blocked");
    // Sigue pudiendo ver quién es y el estado de su cuenta (para mostrar por qué está bloqueada).
    expect((await app.inject({ url: "/api/v1/session/me", headers: auth(fresh) })).statusCode).toBe(
      200,
    );
    const tenant = await app.inject({ url: "/api/v1/tenant", headers: auth(fresh) });
    expect(tenant.statusCode).toBe(200);
    expect(tenant.json().effectiveStatus).toBe("trial_expired");
  });

  it("el superadmin puede ampliar la prueba y el tenant vuelve a operar", async () => {
    const owner = await signup();
    now = new Date(now.getTime() + 22 * 86_400_000);
    const admin = await adminSession(); // sesión de superadmin vigente tras el salto de reloj
    const lg = await login(owner.email);
    const fresh = { accessToken: lg.json().accessToken };
    expect(
      (await app.inject({ url: "/api/v1/team/members", headers: auth(fresh) })).statusCode,
    ).toBe(402);

    const ext = await app.inject({
      method: "POST",
      url: `/api/v1/admin/tenants/${owner.tenantId}/extend-trial`,
      headers: auth(admin),
      payload: { days: 14, reason: "Piloto en curso" },
    });
    expect(ext.statusCode, ext.body).toBe(200);
    expect(
      (await app.inject({ url: "/api/v1/team/members", headers: auth(fresh) })).statusCode,
    ).toBe(200);
  });
});

// ── Archivos ──────────────────────────────────────────────────────────────────────────────────
describe("archivos", () => {
  it("subida en dos pasos: reservar, subir y confirmar; descarga por URL firmada", async () => {
    const s = await signup();
    const ticket = await app.inject({
      method: "POST",
      url: "/api/v1/files/uploads",
      headers: auth(s),
      payload: {
        filename: "../../etc/passwd.pdf",
        contentType: "application/pdf",
        sizeBytes: 1234,
      },
    });
    expect(ticket.statusCode).toBe(201);
    const { fileId, uploadUrl } = ticket.json();
    expect(uploadUrl).toContain(encodeURIComponent(`t/${s.tenantId}/platform/${fileId}/`)); // la clave la fija el servidor
    expect(uploadUrl).not.toContain("..");

    // Sin subir todavía → 409.
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/files/${fileId}/confirm`,
          headers: auth(s),
        })
      ).statusCode,
    ).toBe(409);
    const { rows } = await env.raw.ownerPool.query(
      "select storage_key, filename from files where id = $1",
      [fileId],
    );
    expect(rows[0].filename).toBe("passwd.pdf");
    storage.simulateUpload(rows[0].storage_key, 1234, "application/pdf");

    const ok = await app.inject({
      method: "POST",
      url: `/api/v1/files/${fileId}/confirm`,
      headers: auth(s),
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().status).toBe("ready");
    const dl = await app.inject({ url: `/api/v1/files/${fileId}/download`, headers: auth(s) });
    expect(dl.json().url).toContain("storage.test/download");

    expect(
      (await app.inject({ method: "DELETE", url: `/api/v1/files/${fileId}`, headers: auth(s) }))
        .statusCode,
    ).toBe(204);
    expect(
      (await app.inject({ url: `/api/v1/files/${fileId}/download`, headers: auth(s) })).statusCode,
    ).toBe(404);
  });

  it("rechaza tipos no permitidos, tamaños excesivos y subidas con tamaño distinto al declarado", async () => {
    const s = await signup();
    const bad = (payload: object) =>
      app.inject({ method: "POST", url: "/api/v1/files/uploads", headers: auth(s), payload });
    expect(
      (await bad({ filename: "a.exe", contentType: "application/x-msdownload", sizeBytes: 10 }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await bad({
          filename: "a.pdf",
          contentType: "application/pdf",
          sizeBytes: 26 * 1024 * 1024,
        })
      ).statusCode,
    ).toBe(400);

    const t = await bad({ filename: "a.pdf", contentType: "application/pdf", sizeBytes: 100 });
    const { rows } = await env.raw.ownerPool.query("select storage_key from files where id = $1", [
      t.json().fileId,
    ]);
    storage.simulateUpload(rows[0].storage_key, 999, "application/pdf");
    const mismatch = await app.inject({
      method: "POST",
      url: `/api/v1/files/${t.json().fileId}/confirm`,
      headers: auth(s),
    });
    expect(mismatch.statusCode).toBe(400);
  });
});

// ── Superadmin ────────────────────────────────────────────────────────────────────────────────
async function adminSession() {
  await services.identity.superadmin.bootstrap(
    "root@nexo.test",
    "una contraseña de superadmin larga",
  );
  const res = await app.inject({
    method: "POST",
    url: "/api/v1/admin/auth/login",
    payload: { email: "root@nexo.test", password: "una contraseña de superadmin larga" },
  });
  expect(res.statusCode, res.body).toBe(200);
  return { accessToken: res.json().accessToken as string, refreshCookie: cookieOf(res, "nexo_pt") };
}

describe("superadmin", () => {
  it("login propio con cookie propia; los tokens de un ámbito no valen en el otro", async () => {
    const admin = await adminSession();
    expect(admin.refreshCookie).not.toBe("");
    expect((await app.inject({ url: "/api/v1/admin/me", headers: auth(admin) })).json().email).toBe(
      "root@nexo.test",
    );

    const tenantUser = await signup();
    expect(
      (await app.inject({ url: "/api/v1/admin/me", headers: auth(tenantUser) })).statusCode,
    ).toBe(401);
    expect(
      (await app.inject({ url: "/api/v1/team/members", headers: auth(admin) })).statusCode,
    ).toBe(401);

    const bad = await app.inject({
      method: "POST",
      url: "/api/v1/admin/auth/login",
      payload: { email: "root@nexo.test", password: "incorrecta incorrecta" },
    });
    expect(bad.statusCode).toBe(401);
  });

  it("el superadmin refresca su sesión por su propia cookie", async () => {
    const admin = await adminSession();
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/admin/auth/refresh",
      headers: { cookie: `nexo_pt=${admin.refreshCookie}`, "x-nexo-csrf": "1", origin: ORIGIN },
    });
    expect(r.statusCode).toBe(200);
    expect(cookieOf(r, "nexo_pt")).not.toBe(admin.refreshCookie);
  });

  it("alta manual: crea el tenant, el propietario recibe un email y fija su contraseña", async () => {
    const admin = await adminSession();
    const email = `${uniq("cliente")}@example.com`;
    const created = await app.inject({
      method: "POST",
      url: "/api/v1/admin/tenants",
      headers: auth(admin),
      payload: {
        companyName: "Cliente Manual SL",
        ownerEmail: email,
        ownerFullName: "Carla Cliente",
        billingMode: "manual",
        trialDays: 0,
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    expect(created.json()).toMatchObject({
      origin: "manual",
      status: "active",
      billingMode: "manual",
      memberCount: 1,
    });

    await drainOutbox();
    const mail = mailer.last(email);
    expect(mail?.subject).toContain("Cliente Manual SL");
    const token = tokenFrom(firstLink(mail?.text ?? ""));
    expect((await login(email)).statusCode).toBe(401); // aún no tiene contraseña utilizable

    const set = await app.inject({
      method: "POST",
      url: "/api/v1/auth/reset-password",
      payload: { token, password: PASSWORD },
    });
    expect(set.statusCode).toBe(204);
    const lg = await login(email);
    expect(lg.statusCode).toBe(200);
    expect(lg.json().membership.role).toBe("owner");
    expect(lg.json().tenant.status).toBe("active");
  });

  it("suspender, reactivar y consultar tenants, siempre con motivo y auditado en plataforma", async () => {
    const admin = await adminSession();
    const owner = await signup();
    const sus = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${owner.tenantId}/status`,
      headers: auth(admin),
      payload: { status: "suspended", reason: "Impago de la factura de septiembre" },
    });
    expect(sus.statusCode).toBe(200);
    expect(
      (await app.inject({ url: "/api/v1/team/members", headers: auth(owner) })).statusCode,
    ).toBe(402);
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/admin/tenants/${owner.tenantId}/status`,
          headers: auth(admin),
          payload: { status: "suspended", reason: "otra vez" },
        })
      ).statusCode,
    ).toBe(409);

    const noReason = await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${owner.tenantId}/status`,
      headers: auth(admin),
      payload: { status: "active", reason: "" },
    });
    expect(noReason.statusCode).toBe(400);
    await app.inject({
      method: "PATCH",
      url: `/api/v1/admin/tenants/${owner.tenantId}/status`,
      headers: auth(admin),
      payload: { status: "active", reason: "Pago recibido" },
    });
    expect(
      (await app.inject({ url: "/api/v1/team/members", headers: auth(owner) })).statusCode,
    ).toBe(200);

    const list = await app.inject({ url: "/api/v1/admin/tenants?limit=100", headers: auth(admin) });
    expect(list.json().items.find((t: { id: string }) => t.id === owner.tenantId)).toBeTruthy();
    const filtered = await app.inject({
      url: `/api/v1/admin/tenants?search=${encodeURIComponent("%")}`,
      headers: auth(admin),
    });
    expect(filtered.statusCode).toBe(200); // el comodín % se trata como texto literal

    const audit = await app.inject({ url: "/api/v1/admin/audit?limit=100", headers: auth(admin) });
    const actions = audit.json().items.map((i: { action: string }) => i.action);
    expect(actions).toContain("tenancy.tenant.status_changed");
    expect(actions).toContain("admin.login");
  });

  it("el superadmin NO puede leer datos de negocio de un tenant (solo operativos)", async () => {
    const admin = await adminSession();
    const owner = await signup();
    const detail = await app.inject({
      url: `/api/v1/admin/tenants/${owner.tenantId}`,
      headers: auth(admin),
    });
    expect(detail.statusCode).toBe(200);
    expect(Object.keys(detail.json())).not.toContain("members");
    // Las rutas de tenant (equipo, archivos, auditoría del tenant) no aceptan su token.
    for (const url of ["/api/v1/team/members", "/api/v1/files", "/api/v1/audit"]) {
      expect((await app.inject({ url, headers: auth(admin) })).statusCode, url).toBe(401);
    }
  });
});

describe("rate limit", () => {
  it("limita login y alta por IP con 429 rate_limit.exceeded", async () => {
    const config = parseEnv({
      NODE_ENV: "test",
      DATABASE_URL_APP: env.raw.appUrl,
      DATABASE_URL_PLATFORM: env.raw.platformUrl,
      JWT_SIGNING_KEYS: "k1:0123456789abcdef0123456789abcdef0123",
      NEXO_PUBLIC_URL: ORIGIN,
    });
    const limited = await buildApp({ env: config, logger: createLogger("silent"), database }); // límites activos
    services.registerRoutes(limited);
    await limited.ready();
    try {
      const codes: number[] = [];
      for (let i = 0; i < 12; i++) {
        const res = await limited.inject({
          method: "POST",
          url: "/api/v1/auth/login",
          payload: { email: "x@example.com", password: "mala contraseña" },
        });
        codes.push(res.statusCode);
      }
      expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
      expect(codes.at(-1)).toBe(429);
    } finally {
      await limited.close();
    }
  });
});

describe("salud y seguridad HTTP", () => {
  it("responde /healthz y /readyz y no filtra errores internos", async () => {
    expect((await app.inject({ url: "/healthz" })).statusCode).toBe(200);
    expect((await app.inject({ url: "/readyz" })).statusCode).toBe(200);
    const res = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { email: "no-es-email", password: "x" },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.stringify(res.json())).not.toMatch(/zod|stack|sql/i);
  });
});
