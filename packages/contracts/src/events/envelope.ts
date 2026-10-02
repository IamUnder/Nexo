import { z } from "zod";

/**
 * Sobre común de todos los eventos de dominio (ARCHITECTURE §9.3).
 * Un evento nuevo no existe hasta tener esquema Zod aquí y un test de contrato.
 */
export const eventActorSchema = z.object({
  membershipId: z.string().uuid().nullable(),
  source: z.enum(["user", "system", "api", "import"]),
});

export const eventEnvelopeSchema = z.object({
  /** UUID v7: sirve también de clave de idempotencia. */
  id: z.string().uuid(),
  /** `<módulo>.<entidad>.<hecho>`, p. ej. `crm.deal.won`. */
  type: z.string().regex(/^[a-z_]+\.[a-z_]+\.[a-z_]+$/),
  /** El esquema se versiona; v2 convive con v1 hasta migrar a los consumidores. */
  version: z.number().int().positive(),
  tenantId: z.string().uuid(),
  occurredAt: z.string().datetime(),
  actor: eventActorSchema,
  entity: z.object({ type: z.string(), id: z.string().uuid() }),
  payload: z.unknown(),
});

export type EventEnvelope<TPayload = unknown> = Omit<
  z.infer<typeof eventEnvelopeSchema>,
  "payload"
> & {
  payload: TPayload;
};
