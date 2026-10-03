import type { Role } from "@nexo/contracts";

/**
 * Reglas de cambio de miembros (MODULES_SPEC §2.2). Dominio puro: reciben hechos y devuelven el motivo
 * del rechazo (o `null`), para que la capa de aplicación lo convierta en el error HTTP adecuado.
 */
export type MemberChangeProblem =
  | "last_owner"
  | "owner_only"
  | "cannot_edit_self_role"
  | "cannot_suspend_self"
  | "seat_incompatible";

export interface ChangeFacts {
  actorRole: Role;
  actorIsTarget: boolean;
  targetRole: Role;
  /** Nº de owners ACTIVOS del tenant antes del cambio. */
  activeOwners: number;
  change: { role?: Role | undefined; status?: "active" | "suspended" | undefined };
}

export function checkMemberChange(f: ChangeFacts): MemberChangeProblem | null {
  const { change } = f;

  // Solo un owner puede tocar a un owner o promover a alguien a owner.
  if ((f.targetRole === "owner" || change.role === "owner") && f.actorRole !== "owner")
    return "owner_only";

  if (f.actorIsTarget && change.role !== undefined && change.role !== f.targetRole) {
    return "cannot_edit_self_role";
  }
  if (f.actorIsTarget && change.status === "suspended") return "cannot_suspend_self";

  const demotesOwner =
    f.targetRole === "owner" && change.role !== undefined && change.role !== "owner";
  const suspendsOwner = f.targetRole === "owner" && change.status === "suspended";
  if ((demotesOwner || suspendsOwner) && f.activeOwners <= 1) return "last_owner";

  return null;
}

/** Un admin no puede invitar como owner; solo un owner (la ruta ya excluye `owner` del DTO, esto es defensa). */
export function canInviteRole(actorRole: Role, invited: Role): boolean {
  if (invited === "owner") return false;
  return actorRole === "owner" || actorRole === "admin";
}
