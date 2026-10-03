import { z } from "zod";

/**
 * Eventos del módulo `tenancy` (MODULES_SPEC §10). Un evento nuevo no existe hasta tener esquema
 * aquí y test de contrato. El nombre de tipo y la versión van en `EVENT_TYPES`.
 */
export const tenantCreatedV1 = z.object({
  tenantId: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  origin: z.enum(["self_service", "manual"]),
  billingMode: z.enum(["stripe", "manual"]),
  trialEndsAt: z.string().datetime().nullable(),
  ownerUserId: z.string().uuid(),
  ownerMembershipId: z.string().uuid(),
  /** false si el propietario ya tenía cuenta en Nexo (otro tenant): cambia el email que recibe. */
  ownerIsNewUser: z.boolean(),
  templateKey: z.string(),
});
export type TenantCreatedV1 = z.infer<typeof tenantCreatedV1>;

export const tenantStatusChangedV1 = z.object({
  tenantId: z.string().uuid(),
  from: z.string(),
  to: z.string(),
  reason: z.string(),
});
export type TenantStatusChangedV1 = z.infer<typeof tenantStatusChangedV1>;
