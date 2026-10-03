import { sql } from "drizzle-orm";
import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "../../../platform/db/schema";

/**
 * Esquema del módulo `data-import` (MODULES_SPEC §6.2). Prefijo `import_`.
 * Las referencias a entidades del CRM (`import_items.entity_id`) son `uuid` SIN FK entre módulos.
 * RLS forzada en la migración.
 */
const tenantCol = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id);

export const batches = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    tenantId: tenantCol(),
    entity: text("entity").notNull(),
    filename: text("filename").notNull(),
    status: text("status").notNull(),
    onDuplicate: text("on_duplicate").notNull(),
    /** Campo de destino → columna de origen (útil para repetir el mapeo). */
    mapping: jsonb("mapping").notNull(),
    stats: jsonb("stats").notNull(),
    createdByMembershipId: uuid("created_by_membership_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  },
  (t) => [
    unique("import_batches_tenant_id_unique").on(t.tenantId, t.id),
    index("import_batches_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

export const rows = pgTable(
  "import_rows",
  {
    tenantId: tenantCol(),
    batchId: uuid("batch_id").notNull(),
    rowNumber: integer("row_number").notNull(),
    raw: jsonb("raw").notNull(),
    normalized: jsonb("normalized").notNull(),
    status: text("status").notNull(),
    action: text("action").notNull(),
    errors: jsonb("errors").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.batchId, t.rowNumber] }),
    foreignKey({
      columns: [t.tenantId, t.batchId],
      foreignColumns: [batches.tenantId, batches.id],
      name: "import_rows_batch_fk",
    }),
    index("import_rows_status_idx").on(t.tenantId, t.batchId, t.status),
  ],
);

export const items = pgTable(
  "import_items",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    tenantId: tenantCol(),
    batchId: uuid("batch_id").notNull(),
    entityType: text("entity_type").notNull(),
    /** Registro del CRM (sin FK entre módulos). */
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    /** Valores anteriores para deshacer una actualización. */
    previous: jsonb("previous"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.tenantId, t.batchId],
      foreignColumns: [batches.tenantId, batches.id],
      name: "import_items_batch_fk",
    }),
    index("import_items_batch_idx").on(t.tenantId, t.batchId, t.createdAt),
  ],
);
