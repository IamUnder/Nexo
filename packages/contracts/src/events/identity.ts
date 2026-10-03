import { z } from "zod";

/** Eventos del módulo `identity` (MODULES_SPEC §10). */
export const membershipChangedV1 = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.string(),
  seatType: z.string(),
  status: z.string(),
});
export type MembershipChangedV1 = z.infer<typeof membershipChangedV1>;

export const membershipRemovedV1 = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
});
export type MembershipRemovedV1 = z.infer<typeof membershipRemovedV1>;
