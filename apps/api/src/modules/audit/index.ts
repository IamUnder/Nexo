/**
 * Módulo `audit` (plataforma). Superficie pública: lo único que `composition/` necesita.
 * Implementa el puerto `AuditLogger` del kernel y expone las rutas de consulta.
 */
import type { FastifyInstance } from "fastify";
import type { Database } from "../../platform/db/database";
import type { createGuards } from "../../platform/http/guards";
import type { AuditLogger } from "../../platform/ports";
import { registerAuditRoutes } from "./http/routes";
import { DbAuditLogger } from "./infrastructure/auditLogger";
import { DbAuditReader } from "./infrastructure/auditReader";

export interface AuditModule {
  logger: AuditLogger;
  registerRoutes(app: FastifyInstance): void;
}

export function createAuditModule(deps: {
  database: Database;
  guard: ReturnType<typeof createGuards>;
}): AuditModule {
  const reader = new DbAuditReader(deps.database);
  return {
    logger: new DbAuditLogger(),
    registerRoutes: (app) => registerAuditRoutes(app, { reader, guard: deps.guard }),
  };
}
