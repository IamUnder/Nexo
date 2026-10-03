import type { AuditEntryDto, Page } from "@nexo/contracts";
import { and, desc, eq, lt } from "drizzle-orm";
import type { Database } from "../../../platform/db/database";
import { withPlatform } from "../../../platform/db/platform";
import type { TenantContext } from "../../../platform/tenant/context";
import type { AuditQuery, AuditReader } from "../application/ports";
import { auditLog, platformAuditLog } from "./schema";

/** Cursor opaco = instante ISO + id (orden estable aunque haya filas con el mismo instante). */
function encodeCursor(occurredAt: Date, id: string): string {
  return Buffer.from(`${occurredAt.toISOString()}|${id}`).toString("base64url");
}
function decodeCursor(cursor: string | undefined): Date | null {
  if (!cursor) return null;
  const [at] = Buffer.from(cursor, "base64url").toString().split("|");
  const date = at ? new Date(at) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

export class DbAuditReader implements AuditReader {
  constructor(private readonly database: Database) {}

  async listForTenant(ctx: TenantContext, query: AuditQuery): Promise<Page<AuditEntryDto>> {
    const before = decodeCursor(query.cursor);
    // RLS garantiza que solo se leen filas del tenant; no hace falta (ni se confía en) un filtro manual.
    const rows = await this.database.withTenant(ctx, (tx) =>
      tx
        .select()
        .from(auditLog)
        .where(
          and(
            query.action ? eq(auditLog.action, query.action) : undefined,
            before ? lt(auditLog.occurredAt, before) : undefined,
          ),
        )
        .orderBy(desc(auditLog.occurredAt), desc(auditLog.id))
        .limit(query.limit + 1),
    );
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actorMembershipId: r.actorMembershipId,
        actorSource: r.actorSource,
        before: r.before,
        after: r.after,
        metadata: r.metadata,
        occurredAt: r.occurredAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.occurredAt, last.id) : null,
    };
  }

  async listForPlatform(query: AuditQuery): Promise<Page<AuditEntryDto>> {
    const before = decodeCursor(query.cursor);
    const rows = await withPlatform(this.database, "auditoría de plataforma (superadmin)", (tx) =>
      tx
        .select()
        .from(platformAuditLog)
        .where(
          and(
            query.action ? eq(platformAuditLog.action, query.action) : undefined,
            before ? lt(platformAuditLog.occurredAt, before) : undefined,
          ),
        )
        .orderBy(desc(platformAuditLog.occurredAt), desc(platformAuditLog.id))
        .limit(query.limit + 1),
    );
    const items = rows.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        actorMembershipId: r.actorSuperadminId,
        actorSource: "superadmin",
        before: r.before,
        after: r.after,
        metadata: r.metadata,
        occurredAt: r.occurredAt.toISOString(),
      })),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last.occurredAt, last.id) : null,
    };
  }
}
