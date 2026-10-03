/**
 * Módulo `tenancy` (plataforma): tenants, alta self-service y manual, estados, ajustes y superadmin
 * de tenants. Superficie pública: lo único que `composition/` necesita. Los puertos hacia identity
 * (`OwnerProvisioner`, `SessionIssuer`, `MemberStats`) los cablea la composición.
 */
import type { FastifyInstance } from "fastify";
import type { Database, Tx } from "../../platform/db/database";
import type { createGuards } from "../../platform/http/guards";
import type { AuditLogger, Clock, TenantGate } from "../../platform/ports";
import type { MemberStats, OwnerProvisioner, SessionIssuer } from "./application/ports";
import { TenancyService } from "./application/tenancyService";
import { registerTenancyRoutes } from "./http/routes";
import { DbTenantGate } from "./infrastructure/tenantGate";
import { DbTenantRepository } from "./infrastructure/tenantRepository";

export type { MemberStats, OwnerProvisioner, SessionIssuer } from "./application/ports";
export { AccountExistsError } from "./application/tenancyService";

export interface TenancyModule {
  service: TenancyService;
  gate: TenantGate;
  /** Resúmenes de tenants (para el selector de empresa de identity). */
  summaries: TenancyService["summaries"];
  registerRoutes(app: FastifyInstance): void;
}

export function createTenancyModule(deps: {
  database: Database;
  guard: ReturnType<typeof createGuards>;
  audit: AuditLogger;
  clock: Clock;
  owners: OwnerProvisioner;
  sessions: SessionIssuer;
  members: MemberStats;
  cookieSecure: boolean;
}): TenancyModule {
  const service = new TenancyService({
    database: deps.database,
    repo: new DbTenantRepository(),
    owners: deps.owners,
    sessions: deps.sessions,
    members: deps.members,
    audit: deps.audit,
    clock: deps.clock,
  });
  return {
    service,
    gate: new DbTenantGate(service),
    summaries: (tx, ids) => service.summaries(tx, ids),
    registerRoutes: (app) =>
      registerTenancyRoutes(app, { service, guard: deps.guard, cookieSecure: deps.cookieSecure }),
  };
}
