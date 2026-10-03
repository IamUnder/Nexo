import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { SUBSCRIBER_QUEUES } from "./composition/queues";
import { parseMigrateEnv } from "./platform/config/env";
import { installQueues } from "./platform/queue/boss";

/** Carpeta de migraciones SQL generadas por drizzle-kit (junto a este fichero, en `../drizzle`). */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

export interface MigrateOptions {
  ownerUrl: string;
  /** Contraseñas de login de los roles de aplicación y plataforma (opcional). */
  appPassword?: string | undefined;
  platformPassword?: string | undefined;
  migrationsFolder?: string;
  /** Colas de pg-boss a crear (una por suscriptor de eventos). Requiere DDL: solo `migrate` puede. */
  queues?: string[];
}

/**
 * Aplica las migraciones con el rol PROPIETARIO (único con DDL) y fija las contraseñas de los
 * roles de login. Es el paso de release: corre antes de arrancar `api` y `worker` y termina.
 * Las migraciones son solo hacia adelante y compatibles hacia atrás (ARCHITECTURE §5.6).
 */
export async function runMigrations(options: MigrateOptions): Promise<void> {
  const pool = new Pool({ connectionString: options.ownerUrl, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: options.migrationsFolder ?? MIGRATIONS_FOLDER,
    });

    // Contraseñas con ALTER ROLE; el literal se escapa vía format(%L) en el servidor.
    const setPassword = async (role: string, password: string | undefined) => {
      if (!password) return;
      // `false` = ámbito de sesión; el pool tiene UNA sola conexión, así que persiste entre las dos
      // sentencias. No se loguea ni se interpola en SQL (se escapa con format(%L) en el servidor).
      await pool.query("select set_config('nexo.pwd', $1, false)", [password]);
      await pool.query(
        `do $$ begin execute format('alter role ${role} password %L', current_setting('nexo.pwd')); end $$`,
      );
    };
    await setPassword("nexo_app", options.appPassword);
    await setPassword("nexo_platform", options.platformPassword);
  } finally {
    await pool.end();
  }

  // pg-boss: esquema + colas + permisos del rol de plataforma (DDL → rol propietario).
  await installQueues(options.ownerUrl, options.queues ?? []);
}

// Ejecución directa: `node dist/migrate.js` / `pnpm db:migrate`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const env = parseMigrateEnv();
  runMigrations({
    ownerUrl: env.DATABASE_URL_OWNER,
    appPassword: env.NEXO_APP_DB_PASSWORD,
    platformPassword: env.NEXO_PLATFORM_DB_PASSWORD,
    queues: SUBSCRIBER_QUEUES,
  })
    .then(() => console.log("migraciones aplicadas"))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
