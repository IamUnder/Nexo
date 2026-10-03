/**
 * Utilidades del tenant DEMO (MODULES_SPEC §2.1 y §12): alta idempotente, carga y reseteo de datos
 * ficticios. Vive fuera de `src/modules` a propósito: es operación de plataforma (usa el pool de
 * plataforma para localizar y fijar el tenant demo), no código de negocio de un módulo.
 */
import { Pool } from "pg";
import { createServices } from "../../src/composition/services";
import { parseEnv } from "../../src/platform/config/env";
import { Database } from "../../src/platform/db/database";
import { createLogger } from "../../src/platform/logger";
import type { TenantContext } from "../../src/platform/tenant/context";

export const DEMO_COMPANY = "Nexo Demo";

export interface DemoRuntime {
  services: ReturnType<typeof createServices>;
  database: Database;
  pool: Pool;
  email: string;
  close(): Promise<void>;
}

export function openDemoRuntime(): DemoRuntime {
  const env = parseEnv();
  const email = process.env.DEMO_ADMIN_EMAIL;
  const password = process.env.DEMO_ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("Define DEMO_ADMIN_EMAIL y DEMO_ADMIN_PASSWORD (mínimo 12 caracteres)");
  }
  const database = new Database({
    appUrl: env.DATABASE_URL_APP,
    platformUrl: env.DATABASE_URL_PLATFORM,
  });
  const services = createServices({ env, logger: createLogger("warn"), database });
  const pool = new Pool({ connectionString: env.DATABASE_URL_PLATFORM, max: 1 });
  return {
    services,
    database,
    pool,
    email,
    close: async () => {
      await pool.end();
      await database.close();
    },
  };
}

/** Localiza el tenant demo por el email de su administrador. */
async function findDemo(
  rt: DemoRuntime,
): Promise<{ tenantId: string; membershipId: string } | null> {
  const { rows } = await rt.pool.query(
    `select m.tenant_id, m.id as membership_id
       from memberships m join users u on u.id = m.user_id
      where lower(u.email) = lower($1) and m.role = 'owner'
      limit 1`,
    [rt.email],
  );
  const r = rows[0];
  return r ? { tenantId: r.tenant_id, membershipId: r.membership_id } : null;
}

/** Crea el tenant demo si no existe y lo deja ACTIVO (sin caducidad de prueba) y con el email verificado. */
export async function ensureDemoTenant(rt: DemoRuntime): Promise<TenantContext> {
  let found = await findDemo(rt);
  if (!found) {
    await rt.services.tenancy.service.signupSelfService(
      {
        email: rt.email,
        password: process.env.DEMO_ADMIN_PASSWORD as string,
        fullName: "Administración Demo",
        companyName: DEMO_COMPANY,
        countryCode: "ES",
        acceptTerms: true,
        templateKey: "professional_services",
      },
      {},
    );
    found = await findDemo(rt);
  }
  if (!found) throw new Error("No se pudo crear el tenant demo");
  await rt.pool.query("update tenants set status = 'active', trial_ends_at = null where id = $1", [
    found.tenantId,
  ]);
  await rt.pool.query(
    "update users set email_verified_at = coalesce(email_verified_at, now()) where lower(email) = lower($1)",
    [rt.email],
  );
  return {
    tenantId: found.tenantId,
    actor: { membershipId: found.membershipId, source: "system" },
  };
}

/** Quita lo de ejemplo y lo vuelve a cargar: el demo vuelve a su estado inicial. */
export async function loadDemoData(rt: DemoRuntime, ctx: TenantContext, reset: boolean) {
  const sample = rt.services.crm.services.sampleData;
  if (reset || (await sample.status(ctx)).loaded) await sample.remove(ctx);
  return sample.load(ctx);
}
