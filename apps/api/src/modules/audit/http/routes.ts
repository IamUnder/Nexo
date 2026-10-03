import { auditQuerySchema } from "@nexo/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { type createGuards, tenantContextOf } from "../../../platform/http/guards";
import type { AuditReader } from "../application/ports";

export function registerAuditRoutes(
  app: FastifyInstance,
  deps: { reader: AuditReader; guard: ReturnType<typeof createGuards> },
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    "/api/v1/audit",
    {
      schema: { querystring: auditQuerySchema },
      preHandler: deps.guard({ permission: "audit:log:read" }),
    },
    async (req) => deps.reader.listForTenant(tenantContextOf(req), req.query),
  );

  r.get(
    "/api/v1/admin/audit",
    { schema: { querystring: auditQuerySchema }, preHandler: deps.guard({ scope: "platform" }) },
    async (req) => deps.reader.listForPlatform(req.query),
  );
}
