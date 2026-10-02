import { sql } from "drizzle-orm";
import { index, inet, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "../../../platform/db/schema";

/**
 * Auditoría (MODULES_SPEC §2.4). Inmutable desde la aplicación: la migración retira UPDATE/DELETE
 * a los roles de aplicación y plataforma (solo INSERT y SELECT).
 */

/** Acciones de un TENANT (RLS forzada). */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    actorMembershipId: uuid("actor_membership_id"),
    actorSource: text("actor_source").notNull().default("user"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata"),
    requestId: text("request_id"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("audit_log_tenant_id_id_uq").on(t.tenantId, t.id),
    index("audit_log_tenant_time_idx").on(t.tenantId, t.occurredAt),
    index("audit_log_tenant_action_idx").on(t.tenantId, t.action),
  ],
);

/** Acciones de PLATAFORMA (superadmin, login fallido…). Global: `nexo_app` no tiene acceso. */
export const platformAuditLog = pgTable(
  "platform_audit_log",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    actorSuperadminId: uuid("actor_superadmin_id"),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    metadata: jsonb("metadata"),
    ip: inet("ip"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("platform_audit_time_idx").on(t.occurredAt),
    index("platform_audit_action_idx").on(t.action),
  ],
);
