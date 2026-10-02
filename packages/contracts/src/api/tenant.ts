import { z } from "zod";

export const tenantSettingsInputSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    locale: z.enum(["es-ES", "en-GB"]).optional(),
    timezone: z.string().min(3).max(60).optional(),
    currency: z.string().length(3).toUpperCase().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "empty_update" });
export type TenantSettingsInput = z.infer<typeof tenantSettingsInputSchema>;

export const tenantDtoSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  status: z.string(),
  /** Estado efectivo: una prueba caducada figura como `trial_expired`. */
  effectiveStatus: z.string(),
  trialEndsAt: z.string().nullable(),
  locale: z.string(),
  timezone: z.string(),
  currency: z.string(),
  country: z.string().nullable(),
  createdAt: z.string(),
});
export type TenantDto = z.infer<typeof tenantDtoSchema>;
