/**
 * `pnpm db:check-rls`: audita el aislamiento multitenant del esquema real (ARCHITECTURE §5.5).
 * Usa la URL del propietario (o la de plataforma) porque lee el catálogo de PostgreSQL.
 */
import { Pool } from "pg";
import { auditRls } from "../src/platform/db/rlsAudit";

const url = process.env.DATABASE_URL_OWNER ?? process.env.DATABASE_URL_PLATFORM;
if (!url) {
  console.error("Define DATABASE_URL_OWNER (o DATABASE_URL_PLATFORM) para auditar la RLS.");
  process.exit(2);
}

const pool = new Pool({ connectionString: url, max: 1 });
try {
  const violations = await auditRls(pool);
  if (violations.length === 0) {
    console.log("RLS OK: todas las tablas cumplen las reglas de aislamiento.");
  } else {
    console.error(`RLS: ${violations.length} violación(es):`);
    for (const v of violations)
      console.error(`  - ${v.table}: ${v.rule}${v.detail ? ` (${v.detail})` : ""}`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
