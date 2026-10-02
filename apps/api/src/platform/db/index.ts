// Superficie pública del kernel de BD. `withPlatform` NO se reexporta a propósito: hay que importar
// `./platform` de forma explícita para que `dependency-cruiser` pueda vigilar quién lo usa.
export { Database, type DatabaseOptions, type Db, type Tx } from "./database";
export { auditRls, GLOBAL_TABLES, type Queryable, type RlsViolation } from "./rlsAudit";
export { outboxEvents, processedEvents, type Schema, schema, tenants } from "./schema";
