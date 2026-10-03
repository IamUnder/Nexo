import type { Tx } from "../../../platform/db/database";
import type { AuditEntry, AuditLogger } from "../../../platform/ports";
import type { TenantContext } from "../../../platform/tenant/context";
import { auditLog, platformAuditLog } from "./schema";

/**
 * Implementación del puerto `AuditLogger` del kernel. `record` se ejecuta DENTRO de la transacción
 * del caso de uso: si éste hace rollback, la entrada de auditoría tampoco existe (y viceversa: una
 * acción que se confirma siempre queda auditada).
 *
 * NUNCA pases secretos, tokens ni contraseñas en `before`/`after`/`metadata`.
 */
export class DbAuditLogger implements AuditLogger {
  async record(tx: Tx, ctx: TenantContext, entry: AuditEntry): Promise<void> {
    await tx.insert(auditLog).values({
      tenantId: ctx.tenantId,
      actorMembershipId: ctx.actor.membershipId,
      actorSource: ctx.actor.source,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      metadata: entry.metadata ?? null,
      requestId: ctx.requestId ?? null,
    });
  }

  async recordPlatform(
    tx: Tx,
    actor: { superadminId: string | null; ip?: string | undefined },
    entry: AuditEntry,
  ): Promise<void> {
    await tx.insert(platformAuditLog).values({
      actorSuperadminId: actor.superadminId,
      action: entry.action,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      metadata: entry.metadata ?? null,
      ip: actor.ip ?? null,
    });
  }
}
