import { idParamSchema, requestUploadInputSchema } from "@nexo/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { type createGuards, tenantContextOf } from "../../../platform/http/guards";
import type { FileService } from "../application/fileService";

const listQuery = z.object({
  ownerModule: z.string().max(30).optional(),
  entityType: z.string().max(40).optional(),
  entityId: z.string().uuid().optional(),
});

export function registerFileRoutes(
  app: FastifyInstance,
  deps: { service: FileService; guard: ReturnType<typeof createGuards> },
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { service, guard } = deps;

  r.post(
    "/api/v1/files/uploads",
    {
      schema: { body: requestUploadInputSchema },
      preHandler: guard({ permission: "files:file:create" }),
    },
    async (req, reply) =>
      reply.status(201).send(await service.requestUpload(tenantContextOf(req), req.body)),
  );

  r.post(
    "/api/v1/files/:id/confirm",
    { schema: { params: idParamSchema }, preHandler: guard({ permission: "files:file:create" }) },
    async (req) => service.confirmUpload(tenantContextOf(req), req.params.id),
  );

  r.get(
    "/api/v1/files",
    { schema: { querystring: listQuery }, preHandler: guard({ permission: "files:file:read" }) },
    async (req) => service.list(tenantContextOf(req), req.query),
  );

  r.get(
    "/api/v1/files/:id/download",
    {
      schema: { params: idParamSchema },
      preHandler: guard({ permission: "files:file:read", allowWhenBlocked: true }),
    },
    async (req) => service.downloadUrl(tenantContextOf(req), req.params.id),
  );

  r.delete(
    "/api/v1/files/:id",
    { schema: { params: idParamSchema }, preHandler: guard({ permission: "files:file:delete" }) },
    async (req, reply) => {
      await service.delete(tenantContextOf(req), req.params.id);
      return reply.status(204).send();
    },
  );
}
