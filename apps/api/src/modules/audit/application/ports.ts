import type { AuditEntryDto, Page } from "@nexo/contracts";
import type { TenantContext } from "../../../platform/tenant/context";

export interface AuditQuery {
  limit: number;
  cursor?: string | undefined;
  action?: string | undefined;
}

/** Lectura de la auditoría. La implementa `infrastructure/auditReader.ts`. */
export interface AuditReader {
  listForTenant(ctx: TenantContext, query: AuditQuery): Promise<Page<AuditEntryDto>>;
  listForPlatform(query: AuditQuery): Promise<Page<AuditEntryDto>>;
}
