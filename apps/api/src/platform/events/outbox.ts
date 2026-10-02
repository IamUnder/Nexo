import { type EventEnvelope, eventEnvelopeSchema } from "@nexo/contracts";
import type { Tx } from "../db/database";
import { outboxEvents } from "../db/schema";

/**
 * Publica un evento de dominio en la bandeja de salida (ARCHITECTURE §9).
 *
 * Debe llamarse DENTRO de la transacción del caso de uso (`withTenant`): si esa transacción hace
 * rollback, el evento tampoco existe. Nunca se publica "fuera" de la transacción.
 *
 * El `payload` se valida con el esquema del sobre; cada módulo valida además el esquema concreto
 * de su tipo+versión (en `@nexo/contracts/events`) antes de llamar aquí.
 */
export async function publishEvent(tx: Tx, event: EventEnvelope): Promise<void> {
  const parsed = eventEnvelopeSchema.parse(event);
  await tx.insert(outboxEvents).values({
    id: parsed.id,
    tenantId: parsed.tenantId,
    type: parsed.type,
    version: parsed.version,
    payload: parsed.payload ?? null,
    actor: parsed.actor,
    entityType: parsed.entity.type,
    entityId: parsed.entity.id,
    occurredAt: new Date(parsed.occurredAt),
  });
}
