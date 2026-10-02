import { sql } from "drizzle-orm";
import {
  boolean,
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

/**
 * Esquema del KERNEL (tablas que pertenecen a `platform/`, no a un módulo de negocio).
 *
 * Reglas (ARCHITECTURE §5.2) para toda tabla con `tenant_id`:
 *  - `tenant_id uuid not null references tenants(id)`
 *  - `unique (tenant_id, id)` → destino de FK compuestas dentro del módulo
 *  - RLS habilitada Y forzada con la política `tenant_isolation`
 *    (se aplica en la migración con `select nexo_enable_tenant_rls('<tabla>')`; nunca a mano).
 * El meta-test `rlsAudit` falla el CI si una tabla nueva incumple alguna.
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** UUID v7 nativo de PostgreSQL 18: orden temporal → mejor localidad de índices. */
const uuidV7Pk = () => uuid("id").primaryKey().default(sql`uuidv7()`);

/**
 * `tenants` es una tabla de plataforma (no lleva `tenant_id`; su clave es `id`).
 * El rol `nexo_app` solo puede ver SU fila (política `tenant_self`); `nexo_platform` ve todas.
 * El hito 1 amplía las columnas según MODULES_SPEC §2.1.
 */
export const tenants = pgTable("tenants", {
  id: uuidV7Pk(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  status: text("status").notNull().default("trial"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  origin: text("origin").notNull().default("self_service"),
  isDemo: boolean("is_demo").notNull().default(false),
  locale: text("locale").notNull().default("es-ES"),
  timezone: text("timezone").notNull().default("Europe/Madrid"),
  currency: text("currency").notNull().default("EUR"),
  country: text("country"),
  flags: jsonb("flags").notNull().default({}),
  ...timestamps,
});

/**
 * Bandeja de salida transaccional (ARCHITECTURE §9). Se inserta en la MISMA transacción que el
 * cambio de negocio; el dispatcher del worker la despacha (hito 1).
 */
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: uuidV7Pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    type: text("type").notNull(),
    version: integer("version").notNull(),
    payload: jsonb("payload").notNull(),
    actor: jsonb("actor").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("outbox_events_tenant_id_id_uq").on(t.tenantId, t.id),
    index("outbox_events_tenant_status_idx").on(t.tenantId, t.status, t.occurredAt),
    // El dispatcher (transversal a tenants) escanea solo lo pendiente: índice parcial pequeño.
    index("outbox_events_pending_idx").on(t.occurredAt).where(sql`${t.status} = 'pending'`),
  ],
);

/** Idempotencia de consumidores: un (suscriptor, evento) se procesa una sola vez. */
export const processedEvents = pgTable(
  "processed_events",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    subscriber: text("subscriber").notNull(),
    eventId: uuid("event_id").notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.subscriber, t.eventId] })],
);

export const schema = { tenants, outboxEvents, processedEvents };
export type Schema = typeof schema;
