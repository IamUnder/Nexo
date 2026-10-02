/**
 * Quién ejecuta una operación y en nombre de qué tenant.
 * Se pasa EXPLÍCITAMENTE a casos de uso, jobs y handlers; no hay estado global (ARCHITECTURE §3).
 */
export interface Actor {
  /** Membresía del usuario, o null para el sistema (jobs, eventos, webhooks). */
  membershipId: string | null;
  source: "user" | "system" | "api" | "import";
}

export interface TenantContext {
  /** Inmutable. Sale del JWT / payload del job; NUNCA de parámetros enviados por el cliente. */
  tenantId: string;
  actor: Actor;
  requestId?: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertValidTenantId(tenantId: string): void {
  if (!UUID_RE.test(tenantId)) throw new Error("tenantId inválido: se esperaba un UUID");
}

export function systemContext(tenantId: string, requestId?: string): TenantContext {
  return {
    tenantId,
    actor: { membershipId: null, source: "system" },
    ...(requestId ? { requestId } : {}),
  };
}
