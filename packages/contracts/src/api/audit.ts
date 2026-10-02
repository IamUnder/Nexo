import { z } from "zod";

export const auditEntrySchema = z.object({
  id: z.string().uuid(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  actorMembershipId: z.string().nullable(),
  actorSource: z.string(),
  before: z.unknown(),
  after: z.unknown(),
  metadata: z.unknown(),
  occurredAt: z.string(),
});
export type AuditEntryDto = z.infer<typeof auditEntrySchema>;

export const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
  action: z.string().max(80).optional(),
});
