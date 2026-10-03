import { sql } from "drizzle-orm";
import {
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
 * Esquema de `delivery` (MODULES_SPEC §5.1). Prefijo `delivery_`. La cuenta y el deal de origen del CRM
 * y las membresías de identity son `uuid` SIN FK entre módulos; `account_name` es un snapshot.
 * FK compuestas `(tenant_id, id)` dentro del módulo. RLS forzada en la migración.
 */
const pk = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const tenantCol = () =>
  uuid("tenant_id")
    .notNull()
    .references(() => tenants.id);
const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const projects = pgTable(
  "delivery_projects",
  {
    id: pk(),
    tenantId: tenantCol(),
    name: text("name").notNull(),
    status: text("status").notNull().default("planned"),
    health: text("health").notNull().default("on_track"),
    accountId: uuid("account_id"),
    accountName: text("account_name"),
    accountArchived: boolean("account_archived").notNull().default(false),
    /** Deal ganado que originó el proyecto: único por tenant → idempotencia. */
    sourceDealId: uuid("source_deal_id"),
    ownerMembershipId: uuid("owner_membership_id"),
    startsOn: date("starts_on"),
    dueOn: date("due_on"),
    summary: text("summary"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique("delivery_projects_tenant_id_id_uq").on(t.tenantId, t.id),
    uniqueIndex("delivery_projects_source_deal_uq")
      .on(t.tenantId, t.sourceDealId)
      .where(sql`${t.sourceDealId} is not null`),
    index("delivery_projects_tenant_account_idx").on(t.tenantId, t.accountId),
    index("delivery_projects_tenant_status_idx").on(t.tenantId, t.status),
  ],
);

export const milestones = pgTable(
  "delivery_milestones",
  {
    id: pk(),
    tenantId: tenantCol(),
    projectId: uuid("project_id").notNull(),
    name: text("name").notNull(),
    dueOn: date("due_on"),
    status: text("status").notNull().default("pending"),
    position: integer("position").notNull().default(0),
    createdAt: created(),
  },
  (t) => [
    unique("delivery_milestones_tenant_id_id_uq").on(t.tenantId, t.id),
    foreignKey({
      name: "delivery_milestones_project_fk",
      columns: [t.tenantId, t.projectId],
      foreignColumns: [projects.tenantId, projects.id],
    }),
    index("delivery_milestones_project_idx").on(t.tenantId, t.projectId, t.position),
  ],
);

export const tasks = pgTable(
  "delivery_tasks",
  {
    id: pk(),
    tenantId: tenantCol(),
    projectId: uuid("project_id").notNull(),
    milestoneId: uuid("milestone_id"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("todo"),
    assigneeMembershipId: uuid("assignee_membership_id"),
    dueOn: date("due_on"),
    position: integer("position").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    unique("delivery_tasks_tenant_id_id_uq").on(t.tenantId, t.id),
    foreignKey({
      name: "delivery_tasks_project_fk",
      columns: [t.tenantId, t.projectId],
      foreignColumns: [projects.tenantId, projects.id],
    }),
    foreignKey({
      name: "delivery_tasks_milestone_fk",
      columns: [t.tenantId, t.milestoneId],
      foreignColumns: [milestones.tenantId, milestones.id],
    }),
    index("delivery_tasks_project_idx").on(t.tenantId, t.projectId, t.position),
  ],
);

export const timeEntries = pgTable(
  "delivery_time_entries",
  {
    id: pk(),
    tenantId: tenantCol(),
    projectId: uuid("project_id").notNull(),
    taskId: uuid("task_id"),
    membershipId: uuid("membership_id"),
    minutes: integer("minutes").notNull(),
    workedOn: date("worked_on").notNull(),
    note: text("note"),
    createdAt: created(),
  },
  (t) => [
    foreignKey({
      name: "delivery_time_project_fk",
      columns: [t.tenantId, t.projectId],
      foreignColumns: [projects.tenantId, projects.id],
    }),
    foreignKey({
      name: "delivery_time_task_fk",
      columns: [t.tenantId, t.taskId],
      foreignColumns: [tasks.tenantId, tasks.id],
    }),
    index("delivery_time_project_idx").on(t.tenantId, t.projectId, t.workedOn),
  ],
);
