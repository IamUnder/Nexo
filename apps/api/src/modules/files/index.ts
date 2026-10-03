/**
 * Módulo `files` (plataforma): metadatos de archivos y subida/descarga por URL firmada.
 * Superficie pública para `composition/`. El contenido vive en el puerto `FileStorage` (S3-compatible).
 */
import type { FastifyInstance } from "fastify";
import type { Database } from "../../platform/db/database";
import type { createGuards } from "../../platform/http/guards";
import type { AuditLogger, FileStorage } from "../../platform/ports";
import { FileService } from "./application/fileService";
import type { StorageLimit } from "./application/ports";
import { registerFileRoutes } from "./http/routes";
import { DbFileRepository } from "./infrastructure/fileRepository";

export type { StorageLimit } from "./application/ports";

export interface FilesModule {
  service: FileService;
  registerRoutes(app: FastifyInstance): void;
}

export function createFilesModule(deps: {
  database: Database;
  guard: ReturnType<typeof createGuards>;
  storage: FileStorage;
  limit: StorageLimit;
  audit: AuditLogger;
}): FilesModule {
  const service = new FileService({
    database: deps.database,
    repo: new DbFileRepository(),
    storage: deps.storage,
    limit: deps.limit,
    audit: deps.audit,
  });
  return {
    service,
    registerRoutes: (app) => registerFileRoutes(app, { service, guard: deps.guard }),
  };
}
