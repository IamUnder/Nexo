import { z } from "zod";

/** Roles predefinidos del tenant (MODULES_SPEC §2.2). `owner` es inmutable. */
export const ROLES = ["owner", "admin", "manager", "sales", "delivery", "viewer"] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Tipo de asiento facturable (MODULES_SPEC §9.1). */
export const SEAT_TYPES = ["full", "light"] as const;
export const seatTypeSchema = z.enum(SEAT_TYPES);
export type SeatType = z.infer<typeof seatTypeSchema>;

/** Alcance de datos de un permiso. */
export const PERMISSION_SCOPES = ["own", "all"] as const;
export type PermissionScope = (typeof PERMISSION_SCOPES)[number];
