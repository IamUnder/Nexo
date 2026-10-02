import { z } from "zod";

/**
 * Configuración validada al arrancar (12-factor). Si falta una variable obligatoria el proceso
 * falla de forma explícita (TECH_STACK.md §7). Cada hito añade aquí las variables que necesita
 * (Stripe, Resend, Google…); el listado completo comentado está en `.env.example`.
 */
const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  /** URL pública de la web (origen permitido por CORS y base de enlaces de email). */
  NEXO_PUBLIC_URL: z.string().url().default("http://localhost:5173"),
  /** Modo de resolución de tenant (ARCHITECTURE §6). El PaaS actual no soporta wildcard → `session`. */
  TENANT_RESOLUTION_MODE: z.enum(["session", "subdomain"]).default("session"),
  /** Pool de aplicación (rol `nexo_app`, RLS SIEMPRE aplica). */
  DATABASE_URL_APP: z.string().url(),
  /** Pool de plataforma (rol `nexo_platform`, BYPASSRLS). Solo módulos autorizados (ARCHITECTURE §5.3). */
  DATABASE_URL_PLATFORM: z.string().url(),
});

export type Env = z.infer<typeof baseSchema>;

export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = baseSchema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración de entorno inválida:\n${detail}`);
  }
  return result.data;
}

/** Variables solo para el proceso `migrate` (rol propietario con DDL). Nunca las lee `api`/`worker`. */
const migrateSchema = z.object({
  DATABASE_URL_OWNER: z.string().url(),
  /** Contraseñas de los roles de login; si se definen, `migrate` las aplica con ALTER ROLE. */
  NEXO_APP_DB_PASSWORD: z.string().min(8).optional(),
  NEXO_PLATFORM_DB_PASSWORD: z.string().min(8).optional(),
});

export function parseMigrateEnv(source: Record<string, string | undefined> = process.env) {
  const result = migrateSchema.safeParse(source);
  if (!result.success) {
    const detail = result.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Configuración de migración inválida:\n${detail}`);
  }
  return result.data;
}
