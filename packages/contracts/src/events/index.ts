export * from "./envelope";
export * from "./identity";
export * from "./tenancy";

/** Catálogo de tipos de evento con su versión vigente (la fuente es MODULES_SPEC §10). */
export const EVENT_TYPES = {
  tenantCreated: { type: "tenancy.tenant.created", version: 1 },
  tenantStatusChanged: { type: "tenancy.tenant.status_changed", version: 1 },
  membershipCreated: { type: "identity.membership.created", version: 1 },
  membershipUpdated: { type: "identity.membership.updated", version: 1 },
  membershipRemoved: { type: "identity.membership.removed", version: 1 },
} as const;
