import { parseEnv } from "./platform/config/env";
import { Database } from "./platform/db/database";
import { createLogger } from "./platform/logger";

/**
 * Entry point del worker (pg-boss, dispatcher del outbox, sincronizaciones, jobs programados).
 *
 * Hito 0: solo el esqueleto de arranque y apagado limpio. El dispatcher del outbox y los
 * planificadores se añaden en el hito 1 (ver AGENTS.md §11). Solo el worker programa tareas
 * (ARCHITECTURE §9.5); la API nunca ejecuta cron.
 */
async function main() {
  const env = parseEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const database = new Database({
    appUrl: env.DATABASE_URL_APP,
    platformUrl: env.DATABASE_URL_PLATFORM,
  });

  logger.info("worker iniciado (sin jobs registrados todavía)");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "apagando worker");
    await database.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  // Mantiene el proceso vivo hasta que se registren suscriptores y colas.
  setInterval(() => undefined, 60_000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
