import { boolean, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "../../../platform/db/schema";

/**
 * Esquema de `onboarding` (MODULES_SPEC §8.2). Prefijo `onboarding_`. Se alimenta SOLO de eventos
 * de otros módulos; no lee sus tablas. RLS forzada en la migración.
 */
const tenantCol = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id);

export const progress = pgTable(
  "onboarding_progress",
  {
    tenantId: tenantCol(),
    dismissed: boolean("dismissed").notNull().default(false),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    /** Registros importados (creados + completados) acumulados de todos los lotes. */
    importedTotal: integer("imported_total").notNull().default(0),
    /** Personas invitadas que ya han aceptado. */
    invitedTotal: integer("invited_total").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId] })],
);

export const milestones = pgTable(
  "onboarding_milestones",
  {
    tenantId: tenantCol(),
    key: text("key").notNull(),
    reachedAt: timestamp("reached_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.key] })],
);
