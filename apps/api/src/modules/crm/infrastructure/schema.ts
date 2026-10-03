import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "../../../platform/db/schema";

/**
 * Esquema del módulo `crm` (MODULES_SPEC §3). Prefijo de tabla: `crm_`.
 *
 * Reglas (ARCHITECTURE §5.2): `tenant_id` NOT NULL → tenants, `unique (tenant_id, id)` como destino de FK
 * COMPUESTAS: una fila de un tenant no puede apuntar a una de otro aunque falle un filtro. Las
 * referencias a membresías de `identity` (propietario, autor) son `uuid` SIN FK entre módulos.
 * RLS forzada con `nexo_enable_tenant_rls()` en la migración.
 */
const pk = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const tenantCol = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id);
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const accounts = pgTable(
  "crm_accounts",
  {
    id: pk(),
    tenantId: tenantCol(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    taxId: text("tax_id"),
    domain: text("domain"),
    industry: text("industry"),
    website: text("website"),
    phone: text("phone"),
    status: text("status").notNull().default("prospect"),
    source: text("source"),
    notes: text("notes"),
    ownerMembershipId: uuid("owner_membership_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique("crm_accounts_tenant_id_id_uq").on(t.tenantId, t.id),
    index("crm_accounts_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("crm_accounts_tenant_owner_idx").on(t.tenantId, t.ownerMembershipId),
  ],
);

export const contacts = pgTable(
  "crm_contacts",
  {
    id: pk(),
    tenantId: tenantCol(),
    accountId: uuid("account_id"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    jobTitle: text("job_title"),
    status: text("status").notNull().default("lead"),
    ownerMembershipId: uuid("owner_membership_id"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique("crm_contacts_tenant_id_id_uq").on(t.tenantId, t.id),
    foreignKey({
      name: "crm_contacts_account_fk",
      columns: [t.tenantId, t.accountId],
      foreignColumns: [accounts.tenantId, accounts.id],
    }),
    index("crm_contacts_tenant_account_idx").on(t.tenantId, t.accountId),
    // Un email por tenant entre contactos no borrados (el índice parcial se crea en la migración SQL).
    uniqueIndex("crm_contacts_tenant_email_uq")
      .on(t.tenantId, sql`lower(${t.email})`)
      .where(sql`${t.deletedAt} is null and ${t.email} is not null`),
  ],
);

export const pipelines = pgTable(
  "crm_pipelines",
  {
    id: pk(),
    tenantId: tenantCol(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique("crm_pipelines_tenant_id_id_uq").on(t.tenantId, t.id),
    // Un único pipeline por defecto por tenant (carrera de dos altas simultáneas ⇒ una gana).
    uniqueIndex("crm_pipelines_one_default_uq").on(t.tenantId).where(sql`${t.isDefault} = true`),
  ],
);

export const stages = pgTable(
  "crm_pipeline_stages",
  {
    id: pk(),
    tenantId: tenantCol(),
    pipelineId: uuid("pipeline_id").notNull(),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    probability: integer("probability").notNull(),
    kind: text("kind").notNull().default("open"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique("crm_stages_tenant_id_id_uq").on(t.tenantId, t.id),
    foreignKey({
      name: "crm_stages_pipeline_fk",
      columns: [t.tenantId, t.pipelineId],
      foreignColumns: [pipelines.tenantId, pipelines.id],
    }),
    index("crm_stages_tenant_pipeline_idx").on(t.tenantId, t.pipelineId, t.position),
  ],
);

export const deals = pgTable(
  "crm_deals",
  {
    id: pk(),
    tenantId: tenantCol(),
    name: text("name").notNull(),
    accountId: uuid("account_id").notNull(),
    primaryContactId: uuid("primary_contact_id"),
    pipelineId: uuid("pipeline_id").notNull(),
    stageId: uuid("stage_id").notNull(),
    amountCents: bigint("amount_cents", { mode: "number" }).notNull().default(0),
    currency: text("currency").notNull().default("EUR"),
    probability: integer("probability").notNull().default(0),
    expectedCloseOn: date("expected_close_on", { mode: "string" }),
    ownerMembershipId: uuid("owner_membership_id"),
    status: text("status").notNull().default("open"),
    lostReason: text("lost_reason"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    nextActionText: text("next_action_text"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique("crm_deals_tenant_id_id_uq").on(t.tenantId, t.id),
    foreignKey({
      name: "crm_deals_account_fk",
      columns: [t.tenantId, t.accountId],
      foreignColumns: [accounts.tenantId, accounts.id],
    }),
    foreignKey({
      name: "crm_deals_contact_fk",
      columns: [t.tenantId, t.primaryContactId],
      foreignColumns: [contacts.tenantId, contacts.id],
    }),
    foreignKey({
      name: "crm_deals_pipeline_fk",
      columns: [t.tenantId, t.pipelineId],
      foreignColumns: [pipelines.tenantId, pipelines.id],
    }),
    foreignKey({
      name: "crm_deals_stage_fk",
      columns: [t.tenantId, t.stageId],
      foreignColumns: [stages.tenantId, stages.id],
    }),
    index("crm_deals_tenant_pipeline_status_idx").on(t.tenantId, t.pipelineId, t.status),
    index("crm_deals_tenant_account_idx").on(t.tenantId, t.accountId),
    index("crm_deals_tenant_owner_idx").on(t.tenantId, t.ownerMembershipId),
  ],
);

export const activities = pgTable(
  "crm_activities",
  {
    id: pk(),
    tenantId: tenantCol(),
    kind: text("kind").notNull(),
    subject: text("subject").notNull(),
    body: text("body"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    authorMembershipId: uuid("author_membership_id"),
    accountId: uuid("account_id"),
    contactId: uuid("contact_id"),
    dealId: uuid("deal_id"),
    source: text("source").notNull().default("user"),
    externalRef: text("external_ref"),
    createdAt: created(),
  },
  (t) => [
    unique("crm_activities_tenant_id_id_uq").on(t.tenantId, t.id),
    foreignKey({
      name: "crm_activities_account_fk",
      columns: [t.tenantId, t.accountId],
      foreignColumns: [accounts.tenantId, accounts.id],
    }),
    foreignKey({
      name: "crm_activities_contact_fk",
      columns: [t.tenantId, t.contactId],
      foreignColumns: [contacts.tenantId, contacts.id],
    }),
    foreignKey({
      name: "crm_activities_deal_fk",
      columns: [t.tenantId, t.dealId],
      foreignColumns: [deals.tenantId, deals.id],
    }),
    index("crm_activities_tenant_account_idx").on(t.tenantId, t.accountId, t.occurredAt),
    index("crm_activities_tenant_deal_idx").on(t.tenantId, t.dealId, t.occurredAt),
    index("crm_activities_tenant_contact_idx").on(t.tenantId, t.contactId, t.occurredAt),
  ],
);

export const tasks = pgTable(
  "crm_tasks",
  {
    id: pk(),
    tenantId: tenantCol(),
    title: text("title").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("normal"),
    assigneeMembershipId: uuid("assignee_membership_id"),
    createdByMembershipId: uuid("created_by_membership_id"),
    accountId: uuid("account_id"),
    contactId: uuid("contact_id"),
    dealId: uuid("deal_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique("crm_tasks_tenant_id_id_uq").on(t.tenantId, t.id),
    foreignKey({
      name: "crm_tasks_account_fk",
      columns: [t.tenantId, t.accountId],
      foreignColumns: [accounts.tenantId, accounts.id],
    }),
    foreignKey({
      name: "crm_tasks_contact_fk",
      columns: [t.tenantId, t.contactId],
      foreignColumns: [contacts.tenantId, contacts.id],
    }),
    foreignKey({
      name: "crm_tasks_deal_fk",
      columns: [t.tenantId, t.dealId],
      foreignColumns: [deals.tenantId, deals.id],
    }),
    index("crm_tasks_tenant_assignee_status_idx").on(
      t.tenantId,
      t.assigneeMembershipId,
      t.status,
      t.dueAt,
    ),
  ],
);
