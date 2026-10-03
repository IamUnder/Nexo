import { createServices } from "./composition/services";
import { parseEnv } from "./platform/config/env";
import { Database } from "./platform/db/database";
import { buildApp } from "./platform/http/app";
import { createLogger } from "./platform/logger";

/** Entry point HTTP. La composición cablea módulos y rutas; aquí solo se arranca el servidor. */
async function main() {
  const env = parseEnv();
  const logger = createLogger(env.LOG_LEVEL);
  const database = new Database({
    appUrl: env.DATABASE_URL_APP,
    platformUrl: env.DATABASE_URL_PLATFORM,
  });

  const services = createServices({ env, logger, database });
  // El rate limit solo se puede desactivar fuera de producción (E2E).
  const rateLimit = !(env.RATE_LIMIT_DISABLED && env.NODE_ENV !== "production");
  const app = await buildApp({ env, logger, database, rateLimit });
  services.registerRoutes(app);

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
