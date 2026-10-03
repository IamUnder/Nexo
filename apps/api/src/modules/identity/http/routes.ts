import {
  acceptInvitationInputSchema,
  adminLoginInputSchema,
  changePasswordInputSchema,
  forgotPasswordInputSchema,
  idParamSchema,
  inviteMemberInputSchema,
  loginInputSchema,
  resetPasswordInputSchema,
  selectTenantInputSchema,
  setRolePermissionsInputSchema,
  updateMemberInputSchema,
  verifyEmailInputSchema,
} from "@nexo/contracts";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { UnauthenticatedError } from "../../../platform/errors";
import {
  assertSameSiteRequest,
  clearRefreshCookie,
  readRefreshCookie,
  setRefreshCookie,
} from "../../../platform/http/cookies";
import { type createGuards, platformActorOf, tenantContextOf } from "../../../platform/http/guards";
import type { AuthService, IssuedSession, RequestMeta } from "../application/authService";
import type { SuperadminService } from "../application/superadminService";
import type { TeamService } from "../application/teamService";

const roleParam = z.object({ role: z.string().min(2).max(30) });

export function registerIdentityRoutes(
  app: FastifyInstance,
  deps: {
    auth: AuthService;
    team: TeamService;
    superadmin: SuperadminService;
    guard: ReturnType<typeof createGuards>;
    cookieSecure: boolean;
    publicOrigin: string;
  },
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { auth, team, superadmin, guard } = deps;

  const meta = (req: FastifyRequest): RequestMeta => ({
    ip: req.ip,
    ...(req.headers["user-agent"] ? { userAgent: req.headers["user-agent"] } : {}),
  });
  const sendSession = (reply: FastifyReply, s: IssuedSession, status = 200) => {
    setRefreshCookie(reply, "tenant", s.refreshToken, s.refreshExpiresAt, deps.cookieSecure);
    return reply.status(status).send(s.body);
  };
  /** Endpoints con cookie: exigen cabecera anti-CSRF y Origin permitido. */
  const requireSameSite = (req: FastifyRequest) => {
    if (!assertSameSiteRequest(req, deps.publicOrigin))
      throw new UnauthenticatedError("Petición no permitida");
  };

  // ── Autenticación pública ────────────────────────────────────────────────────────────────────
  r.post(
    "/api/v1/auth/login",
    {
      schema: { body: loginInputSchema },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const out = await auth.login(req.body, meta(req));
      return out.kind === "session" ? sendSession(reply, out.session) : reply.send(out.response);
    },
  );

  r.post(
    "/api/v1/auth/select-tenant",
    {
      schema: { body: selectTenantInputSchema },
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (req, reply) => sendSession(reply, await auth.selectTenant(req.body, meta(req))),
  );

  r.post(
    "/api/v1/auth/refresh",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      requireSameSite(req);
      const token = readRefreshCookie(req, "tenant");
      if (!token) throw new UnauthenticatedError("Sin sesión");
      try {
        return sendSession(reply, await auth.refresh(token, meta(req)));
      } catch (err) {
        clearRefreshCookie(reply, "tenant", deps.cookieSecure);
        throw err;
      }
    },
  );

  r.post("/api/v1/auth/logout", async (req, reply) => {
    requireSameSite(req);
    await auth.logout(readRefreshCookie(req, "tenant"));
    clearRefreshCookie(reply, "tenant", deps.cookieSecure);
    return reply.status(204).send();
  });

  r.post(
    "/api/v1/auth/forgot-password",
    {
      schema: { body: forgotPasswordInputSchema },
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      await auth.forgotPassword(req.body.email);
      return reply.status(202).send(); // siempre igual: no revela si el email existe
    },
  );

  r.post(
    "/api/v1/auth/reset-password",
    {
      schema: { body: resetPasswordInputSchema },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      await auth.resetPassword(req.body);
      return reply.status(204).send();
    },
  );

  r.post(
    "/api/v1/auth/verify-email",
    {
      schema: { body: verifyEmailInputSchema },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      await auth.verifyEmail(req.body.token);
      return reply.status(204).send();
    },
  );

  r.post(
    "/api/v1/auth/accept-invitation",
    {
      schema: { body: acceptInvitationInputSchema },
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const out = await auth.acceptInvitation(req.body, meta(req));
      return out.kind === "session"
        ? sendSession(reply, out.session, 201)
        : reply.status(200).send({ kind: "accepted" });
    },
  );

  // ── Sesión autenticada ───────────────────────────────────────────────────────────────────────
  r.get("/api/v1/session/me", { preHandler: guard({ allowWhenBlocked: true }) }, async (req) => {
    if (!req.auth) throw new UnauthenticatedError();
    return auth.me(req.auth);
  });

  r.post(
    "/api/v1/auth/resend-verification",
    {
      preHandler: guard({ allowWhenBlocked: true }),
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      if (!req.auth) throw new UnauthenticatedError();
      await auth.resendVerification(req.auth);
      return reply.status(202).send();
    },
  );

  r.post(
    "/api/v1/auth/change-password",
    {
      schema: { body: changePasswordInputSchema },
      preHandler: guard({ allowWhenBlocked: true }),
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      if (!req.auth) throw new UnauthenticatedError();
      return sendSession(reply, await auth.changePassword(req.auth, req.body, meta(req)));
    },
  );

  // ── Equipo ───────────────────────────────────────────────────────────────────────────────────
  r.get(
    "/api/v1/team/members",
    { preHandler: guard({ permission: "identity:member:read" }) },
    async (req) => team.listMembers(tenantContextOf(req)),
  );

  r.get(
    "/api/v1/team/invitations",
    { preHandler: guard({ permission: "identity:member:manage" }) },
    async (req) => team.listInvitations(tenantContextOf(req)),
  );

  r.post(
    "/api/v1/team/invitations",
    {
      schema: { body: inviteMemberInputSchema },
      preHandler: guard({ permission: "identity:member:manage" }),
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (req, reply) => reply.status(201).send(await team.invite(tenantContextOf(req), req.body)),
  );

  r.delete(
    "/api/v1/team/invitations/:id",
    {
      schema: { params: idParamSchema },
      preHandler: guard({ permission: "identity:member:manage" }),
    },
    async (req, reply) => {
      await team.revokeInvitation(tenantContextOf(req), req.params.id);
      return reply.status(204).send();
    },
  );

  r.patch(
    "/api/v1/team/members/:id",
    {
      schema: { params: idParamSchema, body: updateMemberInputSchema },
      preHandler: guard({ permission: "identity:member:manage" }),
    },
    async (req) => team.updateMember(tenantContextOf(req), req.params.id, req.body),
  );

  r.get(
    "/api/v1/team/permissions",
    { preHandler: guard({ permission: "identity:member:read" }) },
    async (req) => team.getPermissionMatrix(tenantContextOf(req)),
  );

  r.put(
    "/api/v1/team/permissions/:role",
    {
      schema: { params: roleParam, body: setRolePermissionsInputSchema },
      preHandler: guard({ permission: "identity:role:manage" }),
    },
    async (req) =>
      team.setRolePermissions(tenantContextOf(req), req.params.role, req.body.permissions),
  );

  // ── Superadmin: sesión propia ────────────────────────────────────────────────────────────────
  const sendAdminSession = (
    reply: FastifyReply,
    s: { body: unknown; refreshToken: string; refreshExpiresAt: Date },
  ) => {
    setRefreshCookie(reply, "platform", s.refreshToken, s.refreshExpiresAt, deps.cookieSecure);
    return reply.send(s.body);
  };

  r.post(
    "/api/v1/admin/auth/login",
    {
      schema: { body: adminLoginInputSchema },
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (req, reply) => sendAdminSession(reply, await superadmin.login(req.body, meta(req))),
  );

  r.post(
    "/api/v1/admin/auth/refresh",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (req, reply) => {
      requireSameSite(req);
      const token = readRefreshCookie(req, "platform");
      if (!token) throw new UnauthenticatedError("Sin sesión");
      try {
        return sendAdminSession(reply, await superadmin.refresh(token, meta(req)));
      } catch (err) {
        clearRefreshCookie(reply, "platform", deps.cookieSecure);
        throw err;
      }
    },
  );

  r.post("/api/v1/admin/auth/logout", async (req, reply) => {
    requireSameSite(req);
    await superadmin.logout(readRefreshCookie(req, "platform"));
    clearRefreshCookie(reply, "platform", deps.cookieSecure);
    return reply.status(204).send();
  });

  r.get("/api/v1/admin/me", { preHandler: guard({ scope: "platform" }) }, async (req) =>
    superadmin.me(platformActorOf(req).superadminId),
  );
}
