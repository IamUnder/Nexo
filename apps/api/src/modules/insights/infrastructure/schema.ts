import {
  bigint,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "../../../platform/db/schema";

/**
 * Read models del módulo `insights` (MODULES_SPEC §7.1). Prefijo `insights_`.
 * NO leen tablas de otros módulos: los alimentan los eventos de dominio. Las referencias a entidades
 * de otros módulos (deal, owner, pipeline, stage) son `uuid` SIN FK. RLS forzada en la migración.
 */
const tenantCol = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id);

export const dealFacts = pgTable(
  "insights_deal_facts",
  {
    tenantId: tenantCol(),
    dealId: uuid("deal_id").notNull(),
    name: text("name").notNull(),
    accountName: text("account_name").notNull(),
    ownerId: uuid("owner_id"),
    pipelineId: uuid("pipeline_id").notNull(),
    stageId: uuid("stage_id").notNull(),
    stageName: text("stage_name").notNull(),
    probability: integer("probability").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
    currency: text("currency").notNull(),
    status: text("status").notNull(),
    expectedCloseOn: date("expected_close_on"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull(),
    lostReason: text("lost_reason"),
    /** `occurredAt` del último evento aplicado: los eventos antiguos llegados tarde se ignoran. */
    lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.dealId] }),
    index("insights_deal_facts_status_idx").on(t.tenantId, t.status, t.closedAt),
    index("insights_deal_facts_owner_idx").on(t.tenantId, t.ownerId),
  ],
);

export const stageHistory = pgTable(
  "insights_stage_history",
  {
    /** Id del evento: da idempotencia natural. */
    eventId: uuid("event_id").notNull(),
    tenantId: tenantCol(),
    dealId: uuid("deal_id").notNull(),
    fromStageName: text("from_stage_name"),
    toStageName: text("to_stage_name").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.eventId] }),
    index("insights_stage_history_deal_idx").on(t.tenantId, t.dealId, t.occurredAt),
  ],
);

export const activityDaily = pgTable(
  "insights_activity_daily",
  {
    tenantId: tenantCol(),
    day: date("day").notNull(),
    kind: text("kind").notNull(),
    /** Membresía autora (`uuid` sin FK); el UUID nulo agrupa la actividad de sistema/API. */
    authorId: uuid("author_id").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.day, t.kind, t.authorId] })],
);
