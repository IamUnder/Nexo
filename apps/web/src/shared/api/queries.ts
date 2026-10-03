import type {
  AuditEntryDto,
  InvitationDto,
  MemberDto,
  MeResponse,
  Page,
  PermissionMatrix,
  TenantDto,
} from "@nexo/contracts";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "../auth/authStore";
import { api } from "./client";

/** Claves de caché centralizadas: invalidar es predecible y sin cadenas sueltas por la app. */
export const qk = {
  me: ["me"] as const,
  tenant: ["tenant"] as const,
  members: ["team", "members"] as const,
  invitations: ["team", "invitations"] as const,
  permissions: ["team", "permissions"] as const,
  audit: (action?: string) => ["audit", action ?? "all"] as const,
  adminTenants: (search: string, status: string) => ["admin", "tenants", search, status] as const,
  adminTenant: (id: string) => ["admin", "tenant", id] as const,
  adminAudit: ["admin", "audit"] as const,
};

export function useMe() {
  const status = useAuthStore((s) => s.tenant.status);
  return useQuery({
    queryKey: qk.me,
    queryFn: () => api<MeResponse>("/session/me"),
    enabled: status === "authenticated",
    staleTime: 60_000,
  });
}

/** ¿Tiene el usuario este permiso? (La API es la que impone; esto solo decide qué se muestra.) */
export function useCan(permission: string): boolean {
  const { data } = useMe();
  return data?.permissions.includes(permission) ?? false;
}

export const useTenant = () =>
  useQuery({ queryKey: qk.tenant, queryFn: () => api<TenantDto>("/tenant") });

export const useMembers = () =>
  useQuery({ queryKey: qk.members, queryFn: () => api<MemberDto[]>("/team/members") });

export const useInvitations = (enabled: boolean) =>
  useQuery({
    queryKey: qk.invitations,
    queryFn: () => api<InvitationDto[]>("/team/invitations"),
    enabled,
  });

export const usePermissionMatrix = () =>
  useQuery({ queryKey: qk.permissions, queryFn: () => api<PermissionMatrix>("/team/permissions") });

export const useAudit = (action?: string, enabled = true) =>
  useQuery({
    enabled,
    queryKey: qk.audit(action),
    queryFn: () =>
      api<Page<AuditEntryDto>>(
        `/audit?limit=50${action ? `&action=${encodeURIComponent(action)}` : ""}`,
      ),
  });
