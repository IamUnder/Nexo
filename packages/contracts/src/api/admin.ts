import { z } from "zod";
import { emailSchema, passwordSchema } from "./common";
import { tenantDtoSchema } from "./tenant";

export const adminLoginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

export const adminSessionResponseSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int(),
  admin: z.object({ id: z.string().uuid(), email: z.string(), fullName: z.string() }),
});
export type AdminSessionResponse = z.infer<typeof adminSessionResponseSchema>;

export const billingModeSchema = z.enum(["stripe", "manual"]);

export const createTenantInputSchema = z.object({
  companyName: z.string().trim().min(2).max(120),
  ownerEmail: emailSchema,
  ownerFullName: z.string().trim().min(2).max(120),
  billingMode: billingModeSchema.default("manual"),
  /** Días de prueba; 0 = alta directa como `active` (cliente de pago o design partner). */
  trialDays: z.number().int().min(0).max(365).default(21),
  countryCode: z.string().length(2).toUpperCase().default("ES"),
});
export type CreateTenantInput = z.infer<typeof createTenantInputSchema>;

export const adminTenantDtoSchema = tenantDtoSchema.extend({
  origin: z.string(),
  isDemo: z.boolean(),
  billingMode: z.string(),
  memberCount: z.number().int(),
});
export type AdminTenantDto = z.infer<typeof adminTenantDtoSchema>;

export const updateTenantStatusInputSchema = z.object({
  status: z.enum(["trial", "active", "past_due", "suspended", "cancelled"]),
  reason: z.string().trim().min(3).max(300),
});
export const extendTrialInputSchema = z.object({
  days: z.number().int().min(1).max(180),
  reason: z.string().trim().min(3).max(300),
});

export const bootstrapSuperadminSchema = z.object({ email: emailSchema, password: passwordSchema });
