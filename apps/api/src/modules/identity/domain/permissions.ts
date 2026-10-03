import {
  isPermissionAllowedForSeat,
  PERMISSIONS,
  type Permission,
  type PermissionScope,
  ROLE_PERMISSIONS,
  type Role,
  type SeatType,
} from "@nexo/contracts";

/**
 * Permisos EFECTIVOS de una membresía (ARCHITECTURE §7.4):
 *   paquete por defecto del rol  →  + ajustes del tenant (overrides)  →  filtrado por tipo de asiento.
 * Dominio puro (sin I/O). El rol `owner` es inmutable: ningún ajuste le afecta.
 */
export interface PermissionOverride {
  role: string;
  permission: string;
  granted: boolean;
}

/** Alcance de datos por defecto (MODULES_SPEC §2.2): sales/delivery/viewer ven lo suyo; el resto, todo. */
const DEFAULT_SCOPE: Record<Role, PermissionScope> = {
  owner: "all",
  admin: "all",
  manager: "all",
  sales: "own",
  delivery: "own",
  viewer: "own",
};

export function isKnownPermission(p: string): p is Permission {
  return (PERMISSIONS as readonly string[]).includes(p);
}

export function isEditableRole(role: string): boolean {
  return role !== "owner";
}

/** ¿Está concedido este permiso por defecto al rol? */
export function grantedByDefault(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function effectivePermissions(
  role: Role,
  seat: SeatType,
  overrides: readonly PermissionOverride[],
): Permission[] {
  const forRole = overrides.filter((o) => o.role === role);
  return PERMISSIONS.filter((permission) => {
    // El owner conserva SIEMPRE todo (no se puede quitar permisos a quien paga y administra).
    const granted =
      role === "owner" ||
      (forRole.find((o) => o.permission === permission)?.granted ??
        grantedByDefault(role, permission));
    return granted && isPermissionAllowedForSeat(permission, seat);
  });
}

export function scopeFor(
  role: Role,
  seat: SeatType,
  permission: Permission,
  overrides: readonly PermissionOverride[],
): PermissionScope | null {
  if (!effectivePermissions(role, seat, overrides).includes(permission)) return null;
  return DEFAULT_SCOPE[role];
}

/**
 * Un asiento Light no puede tener roles de gestión: `owner`, `admin` y `manager` exigen asiento Full
 * (un Light solo consulta, comenta, aprueba y registra tiempo; MODULES_SPEC §9.1).
 */
export function isSeatCompatibleWithRole(role: Role, seat: SeatType): boolean {
  if (seat === "full") return true;
  return role !== "owner" && role !== "admin" && role !== "manager";
}
