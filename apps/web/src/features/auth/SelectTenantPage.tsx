import type { SessionResponse } from "@nexo/contracts";
import { Alert, Avatar, Button } from "@nexo/ui";
import { useMutation } from "@tanstack/react-query";
import { Navigate, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { useAuthStore } from "../../shared/auth/authStore";
import { useSelectionStore } from "../../shared/auth/selectionStore";
import { AuthShell } from "../../shared/ui/AuthShell";

/** Elegir empresa sin pedir IDs técnicos: nombre claro y un clic (ARCHITECTURE §6). */
export function SelectTenantPage() {
  const { t } = useTranslation("auth");
  const { t: tc } = useTranslation();
  const navigate = useNavigate();
  const { selectionToken, tenants } = useSelectionStore();

  const select = useMutation({
    mutationFn: (tenantId: string) =>
      api<SessionResponse>("/auth/select-tenant", {
        method: "POST",
        scope: "none",
        body: { selectionToken, tenantId },
      }),
    onSuccess: (res) => {
      useSelectionStore.getState().clear();
      useAuthStore.getState().setTenant(res);
      void navigate({ to: "/" });
    },
  });

  if (!selectionToken) return <Navigate to="/login" />;

  return (
    <AuthShell title={t("select.title")} subtitle={t("select.subtitle")}>
      <div className="flex flex-col gap-3">
        {select.isError ? <Alert tone="error">{errorMessage(tc, select.error)}</Alert> : null}
        <ul className="flex flex-col gap-2">
          {tenants.map((tenant) => (
            <li key={tenant.id}>
              <button
                type="button"
                disabled={select.isPending}
                onClick={() => select.mutate(tenant.id)}
                className="flex w-full items-center gap-3 rounded-card border border-line bg-surface p-3 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:opacity-60"
              >
                <Avatar name={tenant.name} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{tenant.name}</span>
                  <span className="text-secondary block text-xs">
                    {tc(`status.${tenant.status}`)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <Button
          variant="ghost"
          onClick={() => {
            useSelectionStore.getState().clear();
            void navigate({ to: "/login" });
          }}
        >
          {t("select.back")}
        </Button>
      </div>
    </AuthShell>
  );
}
