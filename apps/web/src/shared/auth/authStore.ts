import type { AdminSessionResponse, SessionResponse } from "@nexo/contracts";
import { create } from "zustand";

/**
 * Estado de sesión EN MEMORIA (nunca en localStorage: un XSS no puede robar el token). Al recargar la
 * página la sesión se restaura con el refresh token de la cookie httpOnly (`bootstrap`), no con almacenamiento.
 *
 * Hay dos ámbitos independientes: usuario de tenant y superadmin (cookies y tokens distintos).
 */
export type AuthStatus = "loading" | "anonymous" | "authenticated";

export interface TenantSessionState {
  status: AuthStatus;
  session: SessionResponse | null;
}
export interface AdminSessionState {
  status: AuthStatus;
  session: AdminSessionResponse | null;
}

interface AuthState {
  tenant: TenantSessionState;
  admin: AdminSessionState;
  setTenant(session: SessionResponse): void;
  clearTenant(): void;
  setAdmin(session: AdminSessionResponse): void;
  clearAdmin(): void;
}

export const useAuthStore = create<AuthState>((set) => ({
  tenant: { status: "loading", session: null },
  admin: { status: "loading", session: null },
  setTenant: (session) => set({ tenant: { status: "authenticated", session } }),
  clearTenant: () => set({ tenant: { status: "anonymous", session: null } }),
  setAdmin: (session) => set({ admin: { status: "authenticated", session } }),
  clearAdmin: () => set({ admin: { status: "anonymous", session: null } }),
}));

export const tenantToken = () => useAuthStore.getState().tenant.session?.accessToken;
export const adminToken = () => useAuthStore.getState().admin.session?.accessToken;
