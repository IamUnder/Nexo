import { parseEnv } from "./platform/config/env";
import { Database } from "./platform/db/database";
import { buildApp } from "./platform/http/app";
import { createLogger } from "./platform/logger";

/**
 * Entry point HTTP. Aquí se compone la app; los módulos se registran desde `composition/`
 * (a partir del hito 1). Un solo paquete, tres entry points: api, worker y migrate.
 */
async function main() {
  const env = parseEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const database = new Database({
    appUrl: env.DATABASE_URL_APP,
    platformUrl: env.DATABASE_URL_PLATFORM,
  });

  const app = await buildApp({ env, logger, database });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "apagando api");
    await app.close();
    await database.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: env.PORT, host: env.HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
