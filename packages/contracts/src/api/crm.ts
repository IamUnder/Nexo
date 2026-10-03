import { z } from "zod";

/** DTOs del módulo CRM (MODULES_SPEC §3). Los importes viajan en céntimos enteros + moneda. */
const id = z.string().uuid();
const optionalText = (max: number) => z.string().trim().max(max).optional();
/** Fecha `YYYY-MM-DD` (sin hora). */
export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const ACCOUNT_STATUSES = ["prospect", "active", "at_risk", "inactive"] as const;
export const CONTACT_STATUSES = ["lead", "active", "inactive"] as const;
export const ACTIVITY_KINDS = ["note", "call", "meeting", "email"] as const;
export const SYSTEM_ACTIVITY_KINDS = ["stage_change", "system"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high"] as const;
export const DEAL_STATUSES = ["open", "won", "lost"] as const;
export const STAGE_KINDS = ["open", "won", "lost"] as const;

// ── Empresas ────────────────────────────────────────────────────────────────────────────────────
export const accountSchema = z.object({
  id,
  name: z.string(),
  legalName: z.string().nullable(),
  taxId: z.string().nullable(),
  domain: z.string().nullable(),
  industry: z.string().nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  status: z.string(),
  source: z.string().nullable(),
  notes: z.string().nullable(),
  ownerId: id.nullable(),
  ownerName: z.string().nullable(),
  contactsCount: z.number().int(),
  openDealsCount: z.number().int(),
  openDealsAmountCents: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AccountDto = z.infer<typeof accountSchema>;

export const createAccountInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  legalName: optionalText(200),
  taxId: optionalText(40),
  domain: optionalText(120),
  industry: optionalText(80),
  website: optionalText(200),
  phone: optionalText(40),
  status: z.enum(ACCOUNT_STATUSES).default("prospect"),
  source: optionalText(80),
  notes: optionalText(4000),
  ownerId: id.optional(),
});
export type CreateAccountInput = z.infer<typeof createAccountInputSchema>;

export const updateAccountInputSchema = createAccountInputSchema
  .extend({ status: z.enum(ACCOUNT_STATUSES) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });
export type UpdateAccountInput = z.infer<typeof updateAccountInputSchema>;

// ── Contactos ───────────────────────────────────────────────────────────────────────────────────
export const contactSchema = z.object({
  id,
  accountId: id.nullable(),
  accountName: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string().nullable(),
  fullName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  jobTitle: z.string().nullable(),
  status: z.string(),
  ownerId: id.nullable(),
  ownerName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ContactDto = z.infer<typeof contactSchema>;

export const createContactInputSchema = z.object({
  accountId: id.optional(),
  firstName: z.string().trim().min(1).max(100),
  lastName: optionalText(100),
  email: z.string().trim().toLowerCase().email().max(254).optional(),
  phone: optionalText(40),
  jobTitle: optionalText(100),
  status: z.enum(CONTACT_STATUSES).default("lead"),
  ownerId: id.optional(),
});
export type CreateContactInput = z.infer<typeof createContactInputSchema>;

export const updateContactInputSchema = createContactInputSchema
  .extend({ accountId: id.nullable().optional(), status: z.enum(CONTACT_STATUSES) })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });
export type UpdateContactInput = z.infer<typeof updateContactInputSchema>;

// ── Pipelines ───────────────────────────────────────────────────────────────────────────────────
export const stageSchema = z.object({
  id,
  name: z.string(),
  position: z.number().int(),
  probability: z.number().int().min(0).max(100),
  kind: z.enum(STAGE_KINDS),
  dealsCount: z.number().int(),
});
export type StageDto = z.infer<typeof stageSchema>;

export const pipelineSchema = z.object({
  id,
  name: z.string(),
  isDefault: z.boolean(),
  stages: z.array(stageSchema),
});
export type PipelineDto = z.infer<typeof pipelineSchema>;

/** Sustitución completa de las etapas de un pipeline. Sin `id` = etapa nueva. */
export const setStagesInputSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  stages: z
    .array(
      z.object({
        id: id.optional(),
        name: z.string().trim().min(1).max(60),
        probability: z.number().int().min(0).max(100),
        kind: z.enum(STAGE_KINDS),
      }),
    )
    .min(3)
    .max(15),
});
export type SetStagesInput = z.infer<typeof setStagesInputSchema>;

export const createPipelineInputSchema = z.object({ name: z.string().trim().min(2).max(80) });

// ── Oportunidades ───────────────────────────────────────────────────────────────────────────────
export const dealSchema = z.object({
  id,
  name: z.string(),
  accountId: id,
  accountName: z.string(),
  primaryContactId: id.nullable(),
  primaryContactName: z.string().nullable(),
  pipelineId: id,
  stageId: id,
  stageName: z.string(),
  stageKind: z.enum(STAGE_KINDS),
  amountCents: z.number().int(),
  currency: z.string(),
  probability: z.number().int(),
  expectedCloseOn: z.string().nullable(),
  ownerId: id.nullable(),
  ownerName: z.string().nullable(),
  status: z.enum(DEAL_STATUSES),
  lostReason: z.string().nullable(),
  nextActionAt: z.string().nullable(),
  nextActionText: z.string().nullable(),
  closedAt: z.string().nullable(),
  stageChangedAt: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DealDto = z.infer<typeof dealSchema>;

export const createDealInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  accountId: id,
  primaryContactId: id.optional(),
  pipelineId: id.optional(),
  stageId: id.optional(),
  amountCents: z.number().int().min(0).max(100_000_000_000).default(0),
  currency: z.string().length(3).toUpperCase().optional(),
  expectedCloseOn: dateOnlySchema.optional(),
  ownerId: id.optional(),
  nextActionAt: z.string().datetime().optional(),
  nextActionText: optionalText(200),
});
export type CreateDealInput = z.infer<typeof createDealInputSchema>;

export const updateDealInputSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    primaryContactId: id.nullable(),
    amountCents: z.number().int().min(0).max(100_000_000_000),
    expectedCloseOn: dateOnlySchema.nullable(),
    ownerId: id,
    nextActionAt: z.string().datetime().nullable(),
    nextActionText: z.string().trim().max(200).nullable(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });
export type UpdateDealInput = z.infer<typeof updateDealInputSchema>;

export const moveDealInputSchema = z.object({ stageId: id });
export const loseDealInputSchema = z.object({ reason: z.string().trim().min(2).max(300) });

export const dealsQuerySchema = z.object({
  pipelineId: id.optional(),
  status: z.enum(DEAL_STATUSES).optional(),
  accountId: id.optional(),
  ownerId: id.optional(),
  search: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

// ── Actividad y tareas ──────────────────────────────────────────────────────────────────────────
export const activitySchema = z.object({
  id,
  kind: z.string(),
  subject: z.string(),
  body: z.string().nullable(),
  occurredAt: z.string(),
  authorId: id.nullable(),
  authorName: z.string().nullable(),
  accountId: id.nullable(),
  contactId: id.nullable(),
  dealId: id.nullable(),
  source: z.string(),
});
export type ActivityDto = z.infer<typeof activitySchema>;

export const createActivityInputSchema = z
  .object({
    kind: z.enum(ACTIVITY_KINDS),
    subject: z.string().trim().min(1).max(200),
    body: optionalText(4000),
    occurredAt: z.string().datetime().optional(),
    accountId: id.optional(),
    contactId: id.optional(),
    dealId: id.optional(),
  })
  .refine((v) => v.accountId || v.contactId || v.dealId, { message: "needs_entity" });
export type CreateActivityInput = z.infer<typeof createActivityInputSchema>;

export const activitiesQuerySchema = z.object({
  accountId: id.optional(),
  contactId: id.optional(),
  dealId: id.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const taskSchema = z.object({
  id,
  title: z.string(),
  dueAt: z.string().nullable(),
  status: z.enum(["open", "done"]),
  priority: z.string(),
  assigneeId: id.nullable(),
  assigneeName: z.string().nullable(),
  accountId: id.nullable(),
  accountName: z.string().nullable(),
  contactId: id.nullable(),
  dealId: id.nullable(),
  dealName: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type TaskDto = z.infer<typeof taskSchema>;

export const createTaskInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueAt: z.string().datetime().optional(),
  priority: z.enum(TASK_PRIORITIES).default("normal"),
  assigneeId: id.optional(),
  accountId: id.optional(),
  contactId: id.optional(),
  dealId: id.optional(),
});
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>;

export const updateTaskInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    dueAt: z.string().datetime().nullable(),
    priority: z.enum(TASK_PRIORITIES),
    assigneeId: id,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>;

export const tasksQuerySchema = z.object({
  status: z.enum(["open", "done"]).optional(),
  assignee: z.enum(["me", "all"]).default("me"),
  accountId: id.optional(),
  dealId: id.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

// ── Listados y búsqueda ─────────────────────────────────────────────────────────────────────────
export const listQuerySchema = z.object({
  search: z.string().trim().max(80).optional(),
  status: z.string().max(30).optional(),
  ownerId: id.optional(),
  accountId: id.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const searchQuerySchema = z.object({ q: z.string().trim().min(2).max(80) });
export const searchResultSchema = z.object({
  type: z.enum(["account", "contact", "deal"]),
  id,
  title: z.string(),
  subtitle: z.string().nullable(),
});
export type SearchResult = z.infer<typeof searchResultSchema>;
