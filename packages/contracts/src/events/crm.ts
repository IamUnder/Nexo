import { z } from "zod";

/** Eventos del módulo `crm` (MODULES_SPEC §10). Los marcados «P» son candidatos a webhook público. */
const id = z.string().uuid();

export const accountEventV1 = z.object({
  accountId: id,
  name: z.string(),
  ownerId: id.nullable(),
  status: z.string(),
});
export type AccountEventV1 = z.infer<typeof accountEventV1>;

export const contactEventV1 = z.object({
  contactId: id,
  accountId: id.nullable(),
  email: z.string().nullable(),
  ownerId: id.nullable(),
});
export type ContactEventV1 = z.infer<typeof contactEventV1>;

export const dealEventV1 = z.object({
  dealId: id,
  name: z.string(),
  accountId: id,
  accountName: z.string(),
  pipelineId: id,
  stageId: id,
  amountCents: z.number().int(),
  currency: z.string(),
  ownerId: id.nullable(),
  status: z.enum(["open", "won", "lost"]),
  stageName: z.string(),
  probability: z.number().int(),
  expectedCloseOn: z.string().nullable(),
  createdAt: z.string().datetime(),
  closedAt: z.string().datetime().nullable(),
});
export type DealEventV1 = z.infer<typeof dealEventV1>;

export const dealStageChangedV1 = dealEventV1.extend({
  fromStageId: id.nullable(),
  fromStageName: z.string().nullable(),
  toStageName: z.string(),
});
export type DealStageChangedV1 = z.infer<typeof dealStageChangedV1>;

/** `crm.deal.won.v1`: lo consume `delivery` para crear el proyecto (MODULES_SPEC §5). */
export const dealWonV1 = dealEventV1.extend({
  primaryContactId: id.nullable(),
  wonAt: z.string().datetime(),
  scope: z.string().nullable(),
  contacts: z.array(z.object({ contactId: id, name: z.string(), email: z.string().nullable() })),
});
export type DealWonV1 = z.infer<typeof dealWonV1>;

export const dealLostV1 = dealEventV1.extend({
  lostReason: z.string(),
  lostAt: z.string().datetime(),
});
export type DealLostV1 = z.infer<typeof dealLostV1>;

export const taskEventV1 = z.object({
  taskId: id,
  title: z.string(),
  assigneeId: id.nullable(),
  dealId: id.nullable(),
  accountId: id.nullable(),
});
export type TaskEventV1 = z.infer<typeof taskEventV1>;

export const activityLoggedV1 = z.object({
  activityId: id,
  kind: z.string(),
  accountId: id.nullable(),
  contactId: id.nullable(),
  dealId: id.nullable(),
  source: z.string(),
});
export type ActivityLoggedV1 = z.infer<typeof activityLoggedV1>;
