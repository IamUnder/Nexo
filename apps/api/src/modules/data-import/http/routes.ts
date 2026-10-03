import { batchRowsQuerySchema, createBatchInputSchema, IMPORT_ENTITIES } from "@nexo/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { type createGuards, tenantContextOf } from "../../../platform/http/guards";
import type { ImportService } from "../application/importService";

const idParam = z.object({ id: z.string().uuid() });
const entityParam = z.object({ entity: z.enum(IMPORT_ENTITIES) });

export function registerImportRoutes(
  app: FastifyInstance,
  deps: { service: ImportService; guard: ReturnType<typeof createGuards> },
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { service, guard } = deps;
  const g = (
    permission:
      | "import:batch:read"
      | "import:batch:create"
      | "import:batch:rollback"
      | "import:data:export",
  ) => guard({ entitlement: "data_import", permission });

  r.get("/api/v1/import/batches", { preHandler: g("import:batch:read") }, (req) =>
    service.list(tenantContextOf(req)),
  );
  r.post(
    "/api/v1/import/batches",
    {
      schema: { body: createBatchInputSchema },
      // Los ficheros grandes (hasta 5.000 filas) superan el límite de cuerpo por defecto.
      bodyLimit: 8 * 1024 * 1024,
      preHandler: g("import:batch:create"),
    },
    async (req, reply) =>
      reply.status(201).send(await service.createBatch(tenantContextOf(req), req.body)),
  );
  r.get(
    "/api/v1/import/batches/:id",
    { schema: { params: idParam }, preHandler: g("import:batch:read") },
    (req) => service.get(tenantContextOf(req), req.params.id),
  );
  r.get(
    "/api/v1/import/batches/:id/rows",
    {
      schema: { params: idParam, querystring: batchRowsQuerySchema },
      preHandler: g("import:batch:read"),
    },
    (req) => service.rows(tenantContextOf(req), req.params.id, req.query.status, req.query.limit),
  );
  r.post(
    "/api/v1/import/batches/:id/execute",
    { schema: { params: idParam }, preHandler: g("import:batch:create") },
    async (req, reply) =>
      reply.status(202).send(await service.execute(tenantContextOf(req), req.params.id)),
  );
  r.post(
    "/api/v1/import/batches/:id/rollback",
    { schema: { params: idParam }, preHandler: g("import:batch:rollback") },
    (req) => service.rollback(tenantContextOf(req), req.params.id),
  );
  r.delete(
    "/api/v1/import/batches/:id",
    { schema: { params: idParam }, preHandler: g("import:batch:create") },
    async (req, reply) => {
      await service.discard(tenantContextOf(req), req.params.id);
      return reply.status(204).send();
    },
  );

  // Portabilidad: exportación completa en CSV (siempre disponible, incluso con el tenant bloqueado).
  r.get(
    "/api/v1/import/export/:entity",
    {
      schema: { params: entityParam },
      preHandler: guard({
        entitlement: "data_import",
        permission: "import:data:export",
        allowWhenBlocked: true,
      }),
    },
    async (req, reply) => {
      const csv = await service.exportCsv(tenantContextOf(req), req.params.entity);
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="nexo-${req.params.entity}.csv"`)
        .send(csv);
    },
  );
}
