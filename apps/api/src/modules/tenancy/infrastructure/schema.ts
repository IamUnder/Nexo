import { sql } from "drizzle-orm";
import { jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "../../../platform/db/schema";

/**
 * Esquema del módulo `tenancy`. La tabla `tenants` pertenece al kernel (`platform/db/schema.ts`)
 * porque todas las demás la referencian; este módulo la gestiona.
 */

/** Ajustes clave/valor de un tenant (moneda, zona horaria, plantilla elegida, políticas…). */
export const tenantSettings = pgTable(
  "tenant_settings",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);
