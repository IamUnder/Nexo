/**
 * `pnpm db:seed`: siembra IDEMPOTENTE que corre en CADA release, después de `migrate`
 * (ARCHITECTURE §5.6). Hoy: superadmin inicial. (El catálogo y las plantillas verticales llegan con
 * los hitos 2 y 7.) Seguro de repetir: no duplica ni pisa nada.
 */
import { createServices } from "../src/composition/services";
import { parseEnv } from "../src/platform/config/env";
import { Database } from "../src/platform/db/database";
import { createLogger } from "../src/platform/logger";

const env = parseEnv();
const logger = createLogger("warn");
const database = new Database({
  appUrl: env.DATABASE_URL_APP,
  platformUrl: env.DATABASE_URL_PLATFORM,
});

try {
  const { identity } = createServices({ env, logger, database });
  if (env.SUPERADMIN_BOOTSTRAP_EMAIL && env.SUPERADMIN_BOOTSTRAP_PASSWORD) {
    const result = await identity.superadmin.bootstrap(
      env.SUPERADMIN_BOOTSTRAP_EMAIL,
      env.SUPERADMIN_BOOTSTRAP_PASSWORD,
    );
    console.log(
      `superadmin ${env.SUPERADMIN_BOOTSTRAP_EMAIL}: ${result === "created" ? "creado" : "ya existía"}`,
    );
  } else {
    console.log("seed: SUPERADMIN_BOOTSTRAP_EMAIL/PASSWORD no definidas; no se crea superadmin");
  }
} finally {
  await database.close();
}
