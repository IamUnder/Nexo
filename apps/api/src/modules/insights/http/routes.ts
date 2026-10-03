import { overviewQuerySchema } from "@nexo/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { type createGuards, tenantContextOf } from "../../../platform/http/guards";
import type { InsightsService } from "../application/insightsService";

export function registerInsightsRoutes(
  app: FastifyInstance,
  deps: { service: InsightsService; guard: ReturnType<typeof createGuards> },
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.get(
    "/api/v1/insights/overview",
    {
      schema: { querystring: overviewQuerySchema },
      preHandler: deps.guard({ entitlement: "insights", permission: "insights:dashboard:read" }),
    },
    (req) =>
      deps.service.overview(
        tenantContextOf(req),
        { scope: req.permissionScope ?? "all" },
        req.query,
      ),
  );
}
