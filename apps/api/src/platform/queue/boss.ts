import { Pool } from "pg";
import { PgBoss } from "pg-boss";
import type { SubscriberRegistry } from "../events/subscribers";
import { SubscriberRegistry as Registry } from "../events/subscribers";

/**
 * pg-boss sobre PostgreSQL (D-06). Reparto de responsabilidades (principio de mínimo privilegio):
 *  - `migrate` (rol propietario) instala el esquema `pgboss` y CREA las colas (requiere DDL).
 *  - `api`/`worker` (rol `nexo_platform`) solo encolan y consumen: `migrate:false`, `createSchema:false`.
 * Por eso la lista de colas es ESTÁTICA y se conoce al migrar (`queueNamesFor`).
 */
export const DEAD_LETTER_QUEUE = "evt.dead";
export const PG_BOSS_SCHEMA = "pgboss";

/** Reintentos por defecto de las colas de eventos: backoff exponencial y luego cola de «muertos». */
export const EVENT_QUEUE_OPTIONS = {
  policy: "standard" as const,
  retryLimit: 6,
  retryDelay: 5,
  retryBackoff: true,
  deadLetter: DEAD_LETTER_QUEUE,
  retentionSeconds: 60 * 60 * 24 * 14,
};

export function queueNamesFor(registry: SubscriberRegistry, extra: string[] = []): string[] {
  return [...registry.all().map((s) => Registry.queueFor(s.name)), ...extra];
}

/** Cliente de pg-boss para runtime (sin DDL). */
export function createBoss(platformUrl: string, options: { schedule?: boolean } = {}): PgBoss {
  return new PgBoss({
    connectionString: platformUrl,
    schema: PG_BOSS_SCHEMA,
    migrate: false,
    createSchema: false,
    // Solo el worker programa tareas y supervisa (ARCHITECTURE §9.5); la API nunca ejecuta cron.
    schedule: options.schedule ?? false,
    supervise: options.schedule ?? false,
  });
}

/**
 * Instala pg-boss y crea las colas (paso de release, rol PROPIETARIO). Idempotente.
 * Concede después al rol de plataforma los permisos que necesita en runtime.
 */
export async function installQueues(ownerUrl: string, queues: string[]): Promise<void> {
  const boss = new PgBoss({
    connectionString: ownerUrl,
    schema: PG_BOSS_SCHEMA,
    migrate: true,
    createSchema: true,
    schedule: false,
    supervise: false,
  });
  boss.on("error", () => undefined);
  await boss.start();
  try {
    await boss.createQueue(DEAD_LETTER_QUEUE, {
      policy: "standard",
      retentionSeconds: 60 * 60 * 24 * 30,
    });
    for (const name of queues) {
      const existing = await boss.getQueue(name);
      if (!existing) await boss.createQueue(name, EVENT_QUEUE_OPTIONS);
    }
  } finally {
    await boss.stop({ graceful: true });
  }

  const pool = new Pool({ connectionString: ownerUrl, max: 1 });
  try {
    await pool.query(`
      GRANT USAGE, CREATE ON SCHEMA ${PG_BOSS_SCHEMA} TO nexo_platform;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${PG_BOSS_SCHEMA} TO nexo_platform;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${PG_BOSS_SCHEMA} TO nexo_platform;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${PG_BOSS_SCHEMA} TO nexo_platform;
      ALTER DEFAULT PRIVILEGES IN SCHEMA ${PG_BOSS_SCHEMA}
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nexo_platform;
    `);
  } finally {
    await pool.end();
  }
}
