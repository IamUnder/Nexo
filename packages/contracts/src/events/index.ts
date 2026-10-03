export * from "./crm";
export * from "./delivery";
export * from "./envelope";
export * from "./identity";
export * from "./import";
export * from "./tenancy";

/** Catálogo de tipos de evento con su versión vigente (la fuente es MODULES_SPEC §10). */
export const EVENT_TYPES = {
  tenantCreated: { type: "tenancy.tenant.created", version: 1 },
  tenantStatusChanged: { type: "tenancy.tenant.status_changed", version: 1 },
  membershipCreated: { type: "identity.membership.created", version: 1 },
  membershipUpdated: { type: "identity.membership.updated", version: 1 },
  membershipRemoved: { type: "identity.membership.removed", version: 1 },
  accountCreated: { type: "crm.account.created", version: 1 },
  accountUpdated: { type: "crm.account.updated", version: 1 },
  accountDeleted: { type: "crm.account.deleted", version: 1 },
  contactCreated: { type: "crm.contact.created", version: 1 },
  contactUpdated: { type: "crm.contact.updated", version: 1 },
  contactDeleted: { type: "crm.contact.deleted", version: 1 },
  dealCreated: { type: "crm.deal.created", version: 1 },
  dealUpdated: { type: "crm.deal.updated", version: 1 },
  dealStageChanged: { type: "crm.deal.stage_changed", version: 1 },
  dealWon: { type: "crm.deal.won", version: 1 },
  dealLost: { type: "crm.deal.lost", version: 1 },
  dealDeleted: { type: "crm.deal.deleted", version: 1 },
  projectCreated: { type: "delivery.project.created", version: 1 },
  projectUpdated: { type: "delivery.project.updated", version: 1 },
  projectStatusChanged: { type: "delivery.project.status_changed", version: 1 },
  projectCompleted: { type: "delivery.project.completed", version: 1 },
  deliveryTaskCreated: { type: "delivery.task.created", version: 1 },
  deliveryTaskCompleted: { type: "delivery.task.completed", version: 1 },
  timeLogged: { type: "delivery.time.logged", version: 1 },
  importBatchCompleted: { type: "import.batch.completed", version: 1 },
  importBatchFailed: { type: "import.batch.failed", version: 1 },
  importBatchRolledBack: { type: "import.batch.rolled_back", version: 1 },
  taskCreated: { type: "crm.task.created", version: 1 },
  taskCompleted: { type: "crm.task.completed", version: 1 },
  activityLogged: { type: "crm.activity.logged", version: 1 },
} as const;
