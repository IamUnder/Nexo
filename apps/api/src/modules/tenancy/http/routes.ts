import {
  adminTenantDtoSchema,
  createTenantInputSchema,
  extendTrialInputSchema,
  idParamSchema,
  signupInputSchema,
  tenantDtoSchema,
  tenantSettingsInputSchema,
  updateTenantStatusInputSchema,
} from "@nexo/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { setRefreshCookie } from "../../../platform/http/cookies";
import { type createGuards, platformActorOf, tenantContextOf } from "../../../platform/http/guards";
import type { TenancyService } from "../application/tenancyService";

const adminListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().uuid().optional(),
  search: z.string().trim().max(80).optional(),
  status: z.enum(["trial", "active", "past_due", "suspended", "cancelled"]).optional(),
});

export function registerTenancyRoutes(
  app: FastifyInstance,
  deps: { service: TenancyService; guard: ReturnType<typeof createGuards>; cookieSecure: boolean },
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { service, guard } = deps;

  // ── Alta self-service (pública, con rate limit estricto por IP) ──────────────────────────────
  r.post(
    "/api/v1/signup",
    {
      schema: { body: signupInputSchema },
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const { session } = await service.signupSelfService(req.body, {
        ip: req.ip,
        ...(req.headers["user-agent"] ? { userAgent: req.headers["user-agent"] } : {}),
      });
      setRefreshCookie(
        reply,
        "tenant",
        session.refreshToken,
        session.refreshExpiresAt,
        deps.cookieSecure,
      );
      return reply.status(201).send(session.body);
    },
  );

  // ── Tenant propio ────────────────────────────────────────────────────────────────────────────
  r.get(
    "/api/v1/tenant",
    {
      schema: { response: { 200: tenantDtoSchema } },
      // Visible aunque el tenant esté bloqueado: el usuario debe ver por qué no puede operar.
      preHandler: guard({ permission: "tenancy:settings:read", allowWhenBlocked: true }),
    },
    async (req) => service.getOwn(tenantContextOf(req)),
  );

  r.patch(
    "/api/v1/tenant",
    {
      schema: { body: tenantSettingsInputSchema, response: { 200: tenantDtoSchema } },
      preHandler: guard({ permission: "tenancy:settings:manage" }),
    },
    async (req) => service.updateOwnSettings(tenantContextOf(req), req.body),
  );

  // ── Superadmin ───────────────────────────────────────────────────────────────────────────────
  const admin = guard({ scope: "platform" });

  r.get(
    "/api/v1/admin/tenants",
    { schema: { querystring: adminListQuery }, preHandler: admin },
    async (req) => service.listForAdmin(req.query),
  );

  r.get(
    "/api/v1/admin/tenants/:id",
    {
      schema: { params: idParamSchema, response: { 200: adminTenantDtoSchema } },
      preHandler: admin,
    },
    async (req) => service.getForAdmin(req.params.id),
  );

  r.post(
    "/api/v1/admin/tenants",
    {
      schema: { body: createTenantInputSchema, response: { 201: adminTenantDtoSchema } },
      preHandler: admin,
    },
    async (req, reply) => {
      const dto = await service.createTenantManually(platformActorOf(req).superadminId, req.body);
      return reply.status(201).send(dto);
    },
  );

  r.patch(
    "/api/v1/admin/tenants/:id/status",
    {
      schema: {
        params: idParamSchema,
        body: updateTenantStatusInputSchema,
        response: { 200: adminTenantDtoSchema },
      },
      preHandler: admin,
    },
    async (req) =>
      service.updateStatus(
        platformActorOf(req).superadminId,
        req.params.id,
        req.body.status,
        req.body.reason,
      ),
  );

  r.post(
    "/api/v1/admin/tenants/:id/extend-trial",
    {
      schema: {
        params: idParamSchema,
        body: extendTrialInputSchema,
        response: { 200: adminTenantDtoSchema },
      },
      preHandler: admin,
    },
    async (req) =>
      service.extendTrial(
        platformActorOf(req).superadminId,
        req.params.id,
        req.body.days,
        req.body.reason,
      ),
  );
}
