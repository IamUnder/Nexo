/**
 * Módulo `data-import` (Core): importación guiada (simulación, ejecución asíncrona con checkpoint,
 * rollback) y exportación de datos. NO importa el CRM: escribe a través del puerto `ImportTarget`
 * que `composition/` conecta con el adaptador del CRM.
 */
import type { FastifyInstance } from "fastify";
import type { Database } from "../../platform/db/database";
import type { createGuards } from "../../platform/http/guards";
import type { Logger } from "../../platform/logger";
import type { AuditLogger, Clock } from "../../platform/ports";
import { ImportService } from "./application/importService";
import type { ImportTarget } from "./application/ports";
import { registerImportRoutes } from "./http/routes";
import { DbImportRepository } from "./infrastructure/importRepository";

export type { ImportTarget } from "./application/ports";

export interface DataImportModule {
  service: ImportService;
  registerRoutes(app: FastifyInstance): void;
}

export function createDataImportModule(deps: {
  database: Database;
  guard: ReturnType<typeof createGuards>;
  target: ImportTarget;
  audit: AuditLogger;
  clock: Clock;
  logger: Logger;
}): DataImportModule {
  const service = new ImportService({
    database: deps.database,
    repo: new DbImportRepository(),
    target: deps.target,
    audit: deps.audit,
    clock: deps.clock,
    logger: deps.logger,
  });
  return {
    service,
    registerRoutes: (app) => registerImportRoutes(app, { service, guard: deps.guard }),
  };
}
