import { z } from "zod";

/** DTOs del módulo Data Onboarding (MODULES_SPEC §6). */
const id = z.string().uuid();

export const IMPORT_ENTITIES = ["companies", "contacts"] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

/** Campos de destino por entidad. `required` = al menos uno de la lista debe estar mapeado. */
export const IMPORT_FIELDS = {
  companies: {
    required: ["name"],
    all: ["name", "legalName", "taxId", "domain", "industry", "website", "phone", "notes"],
  },
  contacts: {
    required: ["firstName", "fullName"],
    all: ["firstName", "lastName", "fullName", "email", "phone", "jobTitle", "companyName"],
  },
} as const;

export const MAX_IMPORT_ROWS = 5000;
export const IMPORT_DUPLICATE_POLICIES = ["skip", "update"] as const;
export const IMPORT_BATCH_STATUSES = [
  "simulated",
  "running",
  "completed",
  "failed",
  "rolled_back",
] as const;
export const IMPORT_ROW_STATUSES = [
  "valid",
  "invalid",
  "duplicate",
  "imported",
  "skipped",
] as const;

export const createBatchInputSchema = z.object({
  entity: z.enum(IMPORT_ENTITIES),
  filename: z.string().trim().min(1).max(200),
  onDuplicate: z.enum(IMPORT_DUPLICATE_POLICIES).default("skip"),
  /** Campo de destino → nombre de la columna de origen. */
  mapping: z.record(z.string().max(40), z.string().max(200)),
  /** Filas ya separadas por el navegador: `{ columna: valor }`. */
  rows: z
    .array(z.record(z.string().max(200), z.string().max(2000)))
    .min(1)
    .max(MAX_IMPORT_ROWS),
});
export type CreateBatchInput = z.infer<typeof createBatchInputSchema>;

export const batchStatsSchema = z.object({
  total: z.number().int(),
  valid: z.number().int(),
  invalid: z.number().int(),
  /** Coincidencias con registros que ya existen. */
  duplicates: z.number().int(),
  toCreate: z.number().int(),
  toUpdate: z.number().int(),
  skipped: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  failed: z.number().int(),
});
export type BatchStats = z.infer<typeof batchStatsSchema>;

export const batchSchema = z.object({
  id,
  entity: z.enum(IMPORT_ENTITIES),
  filename: z.string(),
  status: z.enum(IMPORT_BATCH_STATUSES),
  onDuplicate: z.enum(IMPORT_DUPLICATE_POLICIES),
  stats: batchStatsSchema,
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  /** ¿Se puede deshacer todavía? (completado y dentro de la ventana de 30 días). */
  canRollback: z.boolean(),
});
export type BatchDto = z.infer<typeof batchSchema>;

export const batchRowSchema = z.object({
  rowNumber: z.number().int(),
  status: z.enum(IMPORT_ROW_STATUSES),
  action: z.enum(["create", "update", "none"]),
  errors: z.array(z.string()),
  raw: z.record(z.string(), z.string()),
  /** Resumen legible de lo que se importaría (nombre / email). */
  label: z.string(),
});
export type BatchRowDto = z.infer<typeof batchRowSchema>;

export const batchRowsQuerySchema = z.object({
  status: z.enum(IMPORT_ROW_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(100),
});
