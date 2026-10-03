import type { Role, SeatType } from "./roles";

/**
 * Permisos con formato `<módulo>:<recurso>:<acción>` (ARCHITECTURE §7.2).
 * Aquí viven los de plataforma y los de cada módulo de negocio implementado (lista completa de cada
 * módulo en MODULES_SPEC.md).
 */
export const PERMISSIONS = [
  // Plataforma
  "identity:member:read",
  "identity:member:manage",
  "identity:role:manage",
  "tenancy:settings:read",
  "tenancy:settings:manage",
  "billing:subscription:read",
  "billing:subscription:manage",
  "audit:log:read",
  "files:file:read",
  "files:file:create",
  "files:file:delete",
  // CRM
  "crm:account:read",
  "crm:account:create",
  "crm:account:update",
  "crm:account:delete",
  "crm:account:export",
  "crm:contact:read",
  "crm:contact:create",
  "crm:contact:update",
  "crm:contact:delete",
  "crm:deal:read",
  "crm:deal:create",
  "crm:deal:update",
  "crm:deal:delete",
  "crm:deal:manage",
  "crm:task:read",
  "crm:task:create",
  "crm:task:update",
  "crm:task:delete",
  "crm:activity:read",
  "crm:activity:create",
  "crm:pipeline:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PLATFORM_READ: Permission[] = [
  "identity:member:read",
  "tenancy:settings:read",
  "files:file:read",
];

/** Todo el CRM de lectura. */
const CRM_READ: Permission[] = [
  "crm:account:read",
  "crm:contact:read",
  "crm:deal:read",
  "crm:task:read",
  "crm:activity:read",
];

/** Trabajo diario de ventas: crear y editar, sin borrar ni gestionar. */
const CRM_WORK: Permission[] = [
  ...CRM_READ,
  "crm:account:create",
  "crm:account:update",
  "crm:contact:create",
  "crm:contact:update",
  "crm:deal:create",
  "crm:deal:update",
  "crm:task:create",
  "crm:task:update",
  "crm:activity:create",
];

/**
 * Paquetes de permisos por rol. `owner` y `admin` tienen todo; el borrado del tenant y la
 * facturación son del owner por una comprobación explícita en sus casos de uso (no un permiso RBAC).
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS,
  manager: [
    ...PLATFORM_READ,
    "audit:log:read",
    "files:file:create",
    ...CRM_WORK,
    "crm:account:delete",
    "crm:account:export",
    "crm:contact:delete",
    "crm:deal:delete",
    "crm:deal:manage",
    "crm:task:delete",
    "crm:pipeline:manage",
  ],
  sales: [...PLATFORM_READ, "files:file:create", ...CRM_WORK],
  delivery: [
    ...PLATFORM_READ,
    "files:file:create",
    ...CRM_READ,
    "crm:task:create",
    "crm:task:update",
    "crm:activity:create",
  ],
  viewer: [...PLATFORM_READ, ...CRM_READ],
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
