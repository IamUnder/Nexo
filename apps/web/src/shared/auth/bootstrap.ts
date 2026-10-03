import { bootstrapSession } from "../api/client";
import { useAuthStore } from "./authStore";

/**
 * Restaura la sesión al cargar usando la cookie de refresh (httpOnly). Se hace UNA vez por ámbito y
 * solo cuando hace falta (el panel de admin no intenta restaurar la sesión de un usuario de tenant, ni
 * al revés), para no generar peticiones 401 inútiles en cada carga.
 */
const started: Partial<Record<"tenant" | "admin", Promise<void>>> = {};

export function ensureBootstrapped(scope: "tenant" | "admin"): Promise<void> {
  const state = useAuthStore.getState()[scope];
  if (state.status !== "loading") return Promise.resolve();
  started[scope] ??= bootstrapSession(scope);
  return started[scope] as Promise<void>;
}

/** Solo para tests: permite volver a arrancar el estado de sesión. */
export function resetBootstrapForTests(): void {
  delete started.tenant;
  delete started.admin;
  useAuthStore.setState({
    tenant: { status: "loading", session: null },
    admin: { status: "loading", session: null },
  });
}
