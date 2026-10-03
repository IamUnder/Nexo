import { createServices } from "./composition/services";
import { parseEnv } from "./platform/config/env";
import { Database } from "./platform/db/database";
import { startDispatcher, startSubscribers } from "./platform/events/dispatcher";
import { createLogger } from "./platform/logger";
import { createBoss } from "./platform/queue/boss";

/**
 * Entry point del worker: dispatcher del outbox, workers de los suscriptores (pg-boss) y tareas
 * programadas. SOLO el worker programa (ARCHITECTURE §9.5): la API nunca ejecuta cron.
 */
async function main() {
  const env = parseEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const database = new Database({
    appUrl: env.DATABASE_URL_APP,
    platformUrl: env.DATABASE_URL_PLATFORM,
  });
  const services = createServices({ env, logger, database });

  const boss = createBoss(env.DATABASE_URL_PLATFORM, { schedule: true });
  boss.on("error", (err) => logger.error({ err }, "pg-boss"));
  await boss.start();

  await startSubscribers({ database, boss, registry: services.registry, logger });
  const stopDispatcher = startDispatcher({ database, boss, registry: services.registry, logger });
  logger.info({ subscribers: services.registry.all().map((s) => s.name) }, "worker iniciado");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "apagando worker");
    await stopDispatcher();
    await boss.stop({ graceful: true });
    await database.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
