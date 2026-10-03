import { z } from "zod";

/** Eventos del módulo `delivery` (MODULES_SPEC §5.4). */
const id = z.string().uuid();

export const projectEventV1 = z.object({
  projectId: id,
  name: z.string(),
  status: z.string(),
  health: z.string(),
  accountId: id.nullable(),
  ownerId: id.nullable(),
  sourceDealId: id.nullable(),
});
export type ProjectEventV1 = z.infer<typeof projectEventV1>;

export const projectStatusChangedV1 = projectEventV1.extend({
  fromStatus: z.string(),
});
export type ProjectStatusChangedV1 = z.infer<typeof projectStatusChangedV1>;

export const deliveryTaskEventV1 = z.object({
  taskId: id,
  projectId: id,
  title: z.string(),
  assigneeId: id.nullable(),
});
export type DeliveryTaskEventV1 = z.infer<typeof deliveryTaskEventV1>;

export const timeLoggedV1 = z.object({
  entryId: id,
  projectId: id,
  taskId: id.nullable(),
  minutes: z.number().int(),
  membershipId: id.nullable(),
});
export type TimeLoggedV1 = z.infer<typeof timeLoggedV1>;
