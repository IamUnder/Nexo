import { z } from "zod";

/** DTOs del módulo Onboarding y activación (MODULES_SPEC §8). */
export const ONBOARDING_STEPS = [
  "import_50_records",
  "mailbox_connected",
  "invited_3_users",
  "deal_created_or_moved",
  "project_from_deal",
] as const;
export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number];

export const onboardingSchema = z.object({
  steps: z.array(
    z.object({
      key: z.enum(ONBOARDING_STEPS),
      done: z.boolean(),
      reachedAt: z.string().nullable(),
      /** `false` si el módulo que lo hace posible aún no existe (p. ej. buzón): no cuenta para activar. */
      available: z.boolean(),
      /** Progreso numérico cuando aplica (registros importados, personas invitadas). */
      current: z.number().int().nullable(),
      target: z.number().int().nullable(),
    }),
  ),
  activated: z.boolean(),
  activatedAt: z.string().nullable(),
  dismissed: z.boolean(),
});
export type OnboardingDto = z.infer<typeof onboardingSchema>;
