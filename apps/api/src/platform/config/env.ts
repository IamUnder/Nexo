import { z } from "zod";

/**
 * Configuración validada al arrancar (12-factor). Si falta una variable obligatoria el proceso
 * falla de forma explícita (TECH_STACK.md §7). Cada hito añade aquí las variables que necesita
 * (Stripe, Resend, Google…); el listado completo comentado está en `.env.example`.
 */

/** `kid:secreto,kid2:secreto2` → la PRIMERA clave firma; todas validan (rotación sin cortes). */
export interface SigningKeys {
  current: { kid: string; secret: string };
  all: Map<string, string>;
}

export function parseSigningKeys(raw: string): SigningKeys {
  const entries = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const idx = p.indexOf(":");
      if (idx < 1) throw new Error("JWT_SIGNING_KEYS: formato `kid:secreto,kid2:secreto2`");
      return [p.slice(0, idx), p.slice(idx + 1)] as const;
    });
  if (entries.length === 0) throw new Error("JWT_SIGNING_KEYS: define al menos una clave");
  for (const [kid, secret] of entries) {
    if (secret.length < 32)
      throw new Error(`JWT_SIGNING_KEYS: el secreto de «${kid}» debe tener ≥ 32 caracteres`);
  }
  const first = entries[0];
  if (!first) throw new Error("JWT_SIGNING_KEYS vacío");
  return { current: { kid: first[0], secret: first[1] }, all: new Map(entries) };
}

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  /** URL pública de la web (origen permitido por CORS y base de enlaces de email). */
  NEXO_PUBLIC_URL: z.string().url().default("http://localhost:5173"),
  /** Modo de resolución de tenant (ARCHITECTURE §6). El PaaS actual no soporta wildcard → `session`. */
  TENANT_RESOLUTION_MODE: z.enum(["session", "subdomain"]).default("session"),
  NEXO_BASE_DOMAIN: z.string().optional(),
  /** Pool de aplicación (rol `nexo_app`, RLS SIEMPRE aplica). */
  DATABASE_URL_APP: z.string().url(),
  /** Pool de plataforma (rol `nexo_platform`, BYPASSRLS). Solo módulos autorizados (ARCHITECTURE §5.3). */
  DATABASE_URL_PLATFORM: z.string().url(),

  // Sesión
  JWT_SIGNING_KEYS: z.string().min(1),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(60).default(7),

  // Correo del sistema (obligatorio en producción)
  SMTP_URL: z.string().url().optional(),
  EMAIL_FROM_SYSTEM: z.string().default("Nexo <no-reply@nexo.local>"),

  // Almacenamiento S3-compatible (todas o ninguna)
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("eu-west-1"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  /** SOLO para pruebas E2E: desactiva el rate limit. Se IGNORA en producción (nunca se puede apagar allí). */
  RATE_LIMIT_DISABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Solo primer arranque: crea el superadmin inicial (`db:seed`)
  SUPERADMIN_BOOTSTRAP_EMAIL: z.string().email().optional(),
  SUPERADMIN_BOOTSTRAP_PASSWORD: z.string().min(12).optional(),
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
  const env = result.data;
  parseSigningKeys(env.JWT_SIGNING_KEYS); // falla pronto si el formato o la longitud no valen
  if (env.TENANT_RESOLUTION_MODE === "subdomain" && !env.NEXO_BASE_DOMAIN) {
    throw new Error(
      "Configuración de entorno inválida:\n  - NEXO_BASE_DOMAIN: obligatoria en modo subdomain",
    );
  }
  return env;
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
