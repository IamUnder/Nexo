import { z } from "zod";
import { roleSchema, seatTypeSchema } from "../roles";
import { emailSchema } from "./common";

export const memberSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string(),
  fullName: z.string(),
  role: z.string(),
  seatType: z.string(),
  status: z.string(),
  title: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  createdAt: z.string(),
});
export type MemberDto = z.infer<typeof memberSchema>;

export const inviteMemberInputSchema = z.object({
  email: emailSchema,
  role: roleSchema.exclude(["owner"]),
  seatType: seatTypeSchema.default("full"),
});
export type InviteMemberInput = z.infer<typeof inviteMemberInputSchema>;

export const invitationSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  role: z.string(),
  seatType: z.string(),
  expiresAt: z.string(),
  createdAt: z.string(),
  status: z.enum(["pending", "expired", "accepted", "revoked"]),
});
export type InvitationDto = z.infer<typeof invitationSchema>;

export const updateMemberInputSchema = z
  .object({
    role: roleSchema.optional(),
    seatType: seatTypeSchema.optional(),
    status: z.enum(["active", "suspended"]).optional(),
  })
  .refine((v) => v.role !== undefined || v.seatType !== undefined || v.status !== undefined, {
    message: "empty_update",
  });
export type UpdateMemberInput = z.infer<typeof updateMemberInputSchema>;

/** Matriz de permisos por rol: lo concedido por defecto, los ajustes del tenant y el resultado. */
export const permissionMatrixSchema = z.object({
  roles: z.array(
    z.object({
      role: z.string(),
      editable: z.boolean(),
      permissions: z.array(
        z.object({
          permission: z.string(),
          granted: z.boolean(),
          source: z.enum(["default", "override"]),
        }),
      ),
    }),
  ),
});
export type PermissionMatrix = z.infer<typeof permissionMatrixSchema>;

export const setRolePermissionsInputSchema = z.object({
  /** permiso → concedido. Solo los que difieren del valor por defecto se guardan como ajuste. */
  permissions: z.record(z.string(), z.boolean()),
});
