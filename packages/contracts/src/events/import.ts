import { z } from "zod";

/** Eventos del módulo `data-import` (MODULES_SPEC §6.4). */
export const importBatchEventV1 = z.object({
  batchId: z.string().uuid(),
  entity: z.enum(["companies", "contacts"]),
  created: z.number().int(),
  updated: z.number().int(),
  failed: z.number().int(),
});
export type ImportBatchEventV1 = z.infer<typeof importBatchEventV1>;
