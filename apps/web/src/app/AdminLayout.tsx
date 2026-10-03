import { Button, cn, Icon } from "@nexo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { logout } from "../shared/api/client";
import { useAuthStore } from "../shared/auth/authStore";
import { useTheme } from "../shared/theme";

/**
 * Panel de administración de Nexo. Visualmente siempre con la identidad Nexo y separado de las
 * sesiones de tenant (cookie, token y rutas propios). Solo muestra estado operativo de las empresas.
 */
export function AdminLayout() {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();
  const admin = useAuthStore((s) => s.admin.session?.admin);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const links = [
    {
      to: "/admin",
      label: t("nav.tenants"),
      icon: "building" as const,
      active: pathname === "/admin",
    },
    {
      to: "/admin/audit",
      label: t("nav.audit"),
      icon: "scroll" as const,
      active: pathname.startsWith("/admin/audit"),
    },
  ];

  return (
    <div className="bg-canvas text-primary min-h-dvh">
      <header className="border-line bg-surface sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b px-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <img src="/brand/nexo-mark.svg" alt="" width={28} height={28} />
            <span className="font-display text-base font-semibold">{t("title")}</span>
          </div>
          <nav aria-label={t("nav.label")} className="flex gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                aria-current={l.active ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-control px-3 text-sm outline-none hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus",
                  l.active ? "bg-selection text-primary font-semibold" : "text-secondary",
                )}
              >
                <Icon name={l.icon} size={16} />
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-secondary hidden text-sm md:inline">{admin?.email}</span>
          <Button
            variant="ghost"
            onClick={toggle}
            aria-label={theme === "dark" ? tc("theme.toLight") : tc("theme.toDark")}
          >
            <Icon name={theme === "dark" ? "sun" : "moon"} />
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              await logout("admin");
              queryClient.clear();
              void navigate({ to: "/admin/login" });
            }}
          >
            <Icon name="log-out" size={16} />
            <span className="hidden sm:inline">{t("logout")}</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
