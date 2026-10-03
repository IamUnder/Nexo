import { z } from "zod";
import { emailSchema, passwordSchema } from "./common";

export const signupInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  fullName: z.string().trim().min(2).max(120),
  companyName: z.string().trim().min(2).max(120),
  countryCode: z.string().length(2).toUpperCase().default("ES"),
  /** Plantilla vertical (se aplica en el hito 7). */
  templateKey: z.string().max(60).default("professional_services"),
  acceptTerms: z.literal(true),
});
export type SignupInput = z.infer<typeof signupInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const selectTenantInputSchema = z.object({
  selectionToken: z.string().min(10).max(2000),
  tenantId: z.string().uuid(),
});
export type SelectTenantInput = z.infer<typeof selectTenantInputSchema>;

export const forgotPasswordInputSchema = z.object({ email: emailSchema });
export const resetPasswordInputSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});
export const verifyEmailInputSchema = z.object({ token: z.string().min(10).max(200) });
export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: passwordSchema,
});
export const acceptInvitationInputSchema = z.object({
  token: z.string().min(10).max(200),
  /** Obligatorios solo si el email invitado aún no tiene cuenta. */
  fullName: z.string().trim().min(2).max(120).optional(),
  password: passwordSchema.optional(),
});

export const tenantSummarySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  status: z.string(),
});
export type TenantSummary = z.infer<typeof tenantSummarySchema>;

export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  locale: z.string(),
  emailVerified: z.boolean(),
});

export const sessionMembershipSchema = z.object({
  id: z.string().uuid(),
  role: z.string(),
  seatType: z.string(),
});

/** Respuesta de login/refresh/select-tenant/signup cuando ya hay sesión. */
export const sessionResponseSchema = z.object({
  kind: z.literal("session"),
  accessToken: z.string(),
  /** Segundos de vida del access token. */
  expiresIn: z.number().int(),
  user: sessionUserSchema,
  tenant: tenantSummarySchema,
  membership: sessionMembershipSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** Login de un usuario con varias empresas: debe elegir una (sin pedir IDs técnicos). */
export const tenantSelectionResponseSchema = z.object({
  kind: z.literal("selection"),
  selectionToken: z.string(),
  tenants: z.array(tenantSummarySchema),
});
export type TenantSelectionResponse = z.infer<typeof tenantSelectionResponseSchema>;

export const loginResponseSchema = z.discriminatedUnion("kind", [
  sessionResponseSchema,
  tenantSelectionResponseSchema,
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

/** Aceptar una invitación con una cuenta que ya existía: queda añadida, pero debe iniciar sesión. */
export const invitationAcceptedResponseSchema = z.object({ kind: z.literal("accepted") });
export const acceptInvitationResponseSchema = z.discriminatedUnion("kind", [
  sessionResponseSchema,
  invitationAcceptedResponseSchema,
]);
export type AcceptInvitationResponse = z.infer<typeof acceptInvitationResponseSchema>;

/** `GET /session/me`: todo lo que la UI necesita para construir navegación y permisos. */
export const meResponseSchema = z.object({
  user: sessionUserSchema,
  tenant: tenantSummarySchema.extend({
    locale: z.string(),
    timezone: z.string(),
    currency: z.string(),
    trialEndsAt: z.string().nullable(),
  }),
  membership: sessionMembershipSchema,
  permissions: z.array(z.string()),
  modules: z.array(z.string()),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
