import { z } from "zod";

/** DTOs del módulo Delivery Lite (MODULES_SPEC §5). */
const id = z.string().uuid();
const optionalText = (max: number) => z.string().trim().max(max).optional();
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const PROJECT_STATUSES = [
  "planned",
  "in_progress",
  "at_risk",
  "blocked",
  "done",
  "cancelled",
] as const;
export const PROJECT_HEALTH = ["on_track", "at_risk", "off_track"] as const;
export const DELIVERY_TASK_STATUSES = ["todo", "doing", "blocked", "done"] as const;
export const MILESTONE_STATUSES = ["pending", "done"] as const;

export const projectSchema = z.object({
  id,
  name: z.string(),
  status: z.enum(PROJECT_STATUSES),
  health: z.enum(PROJECT_HEALTH),
  accountId: id.nullable(),
  accountName: z.string().nullable(),
  accountArchived: z.boolean(),
  sourceDealId: id.nullable(),
  ownerId: id.nullable(),
  ownerName: z.string().nullable(),
  startsOn: z.string().nullable(),
  dueOn: z.string().nullable(),
  summary: z.string().nullable(),
  tasksTotal: z.number().int(),
  tasksDone: z.number().int(),
  tasksOverdue: z.number().int(),
  minutesLogged: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ProjectDto = z.infer<typeof projectSchema>;

export const createProjectInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  accountId: id.optional(),
  accountName: optionalText(160),
  ownerId: id.optional(),
  startsOn: dateOnly.optional(),
  dueOn: dateOnly.optional(),
  summary: optionalText(4000),
});
export type CreateProjectInput = z.infer<typeof createProjectInputSchema>;

export const updateProjectInputSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    status: z.enum(PROJECT_STATUSES),
    health: z.enum(PROJECT_HEALTH),
    ownerId: id,
    startsOn: dateOnly.nullable(),
    dueOn: dateOnly.nullable(),
    summary: z.string().trim().max(4000).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });
export type UpdateProjectInput = z.infer<typeof updateProjectInputSchema>;

export const projectsQuerySchema = z.object({
  accountId: id.optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export const milestoneSchema = z.object({
  id,
  projectId: id,
  name: z.string(),
  dueOn: z.string().nullable(),
  status: z.enum(MILESTONE_STATUSES),
  position: z.number().int(),
});
export type MilestoneDto = z.infer<typeof milestoneSchema>;

export const createMilestoneInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  dueOn: dateOnly.optional(),
});
export const updateMilestoneInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    dueOn: dateOnly.nullable(),
    status: z.enum(MILESTONE_STATUSES),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

export const deliveryTaskSchema = z.object({
  id,
  projectId: id,
  milestoneId: id.nullable(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(DELIVERY_TASK_STATUSES),
  assigneeId: id.nullable(),
  assigneeName: z.string().nullable(),
  dueOn: z.string().nullable(),
  position: z.number().int(),
  completedAt: z.string().nullable(),
  overdue: z.boolean(),
});
export type DeliveryTaskDto = z.infer<typeof deliveryTaskSchema>;

export const createDeliveryTaskInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: optionalText(4000),
  milestoneId: id.optional(),
  assigneeId: id.optional(),
  dueOn: dateOnly.optional(),
});
export const updateDeliveryTaskInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).nullable(),
    status: z.enum(DELIVERY_TASK_STATUSES),
    milestoneId: id.nullable(),
    assigneeId: id.nullable(),
    dueOn: dateOnly.nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });

export const timeEntrySchema = z.object({
  id,
  projectId: id,
  taskId: id.nullable(),
  membershipId: id.nullable(),
  membershipName: z.string().nullable(),
  minutes: z.number().int(),
  workedOn: z.string(),
  note: z.string().nullable(),
});
export type TimeEntryDto = z.infer<typeof timeEntrySchema>;

export const createTimeEntryInputSchema = z.object({
  taskId: id.optional(),
  minutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60),
  workedOn: dateOnly.optional(),
  note: optionalText(500),
});

/** Detalle de un proyecto: el propio proyecto + hitos + tareas + tiempo. */
export const projectDetailSchema = z.object({
  project: projectSchema,
  milestones: z.array(milestoneSchema),
  tasks: z.array(deliveryTaskSchema),
  time: z.array(timeEntrySchema),
});
export type ProjectDetailDto = z.infer<typeof projectDetailSchema>;
