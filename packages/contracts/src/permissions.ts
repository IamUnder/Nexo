import type { Role, SeatType } from "./roles";

/**
 * Permisos con formato `<módulo>:<recurso>:<acción>` (ARCHITECTURE §7.2).
 * Aquí viven los del hito 1; cada módulo añade los suyos cuando se implementa
 * (la lista completa está en MODULES_SPEC.md, sección de cada módulo).
 */
export const PERMISSIONS = [
  "identity:member:read",
  "identity:member:manage",
  "identity:role:manage",
  "tenancy:settings:read",
  "tenancy:settings:manage",
  "billing:subscription:read",
  "billing:subscription:manage",
  "audit:log:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Paquetes de permisos por rol. `owner` y `admin` lo tienen todo (admin sin borrar tenant: se añade en hito 1). */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  manager: ["identity:member:read", "tenancy:settings:read", "audit:log:read"],
  sales: ["identity:member:read", "tenancy:settings:read"],
  delivery: ["identity:member:read", "tenancy:settings:read"],
  viewer: ["identity:member:read", "tenancy:settings:read"],
};

/**
 * Permisos de lectura/comentario permitidos a un asiento Light (MODULES_SPEC §2.2):
 * consultar, comentar, aprobar, registrar tiempo/tareas y actualizar estados limitados.
 * Un permiso `manage`/`delete`/`create` de configuración nunca es compatible con Light.
 */
export function isPermissionAllowedForSeat(permission: Permission, seat: SeatType): boolean {
  if (seat === "full") return true;
  return permission.endsWith(":read");
}
