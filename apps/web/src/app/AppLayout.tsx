import { Alert, Avatar, Button, cn, Icon, type IconName, Menu } from "@nexo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api, logout } from "../shared/api/client";
import { qk, useMe } from "../shared/api/queries";
import { useTheme } from "../shared/theme";

interface NavItem {
  to: "/" | "/team" | "/settings" | "/audit";
  label: string;
  icon: IconName;
  /** Permiso necesario para ver el destino (la API sigue siendo quien impone). */
  permission?: string;
}

/** Avisos del estado de la cuenta (prueba, bloqueo, email sin confirmar). */
function AccountBanners() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const resend = useMutation({
    mutationFn: () => api<void>("/auth/resend-verification", { method: "POST" }),
  });
  if (!me) return null;

  const status = me.tenant.status;
  const trialEnds = me.tenant.trialEndsAt ? new Date(me.tenant.trialEndsAt) : null;
  const msLeft = trialEnds ? trialEnds.getTime() - Date.now() : null;
  const daysLeft = msLeft !== null ? Math.ceil(msLeft / 86_400_000) : null;

  return (
    <div className="flex flex-col gap-2">
      {status === "suspended" ? <Alert tone="error">{t("banner.suspended")}</Alert> : null}
      {status === "cancelled" ? <Alert tone="error">{t("banner.cancelled")}</Alert> : null}
      {status === "past_due" ? <Alert tone="warning">{t("banner.pastDue")}</Alert> : null}
      {status === "trial" && daysLeft !== null && daysLeft <= 0 ? (
        <Alert tone="error">{t("banner.trialExpired")}</Alert>
      ) : null}
      {status === "trial" && daysLeft !== null && daysLeft > 0 && daysLeft <= 7 ? (
        <Alert tone="warning">{t("banner.trialDays", { count: daysLeft })}</Alert>
      ) : null}
      {!me.user.emailVerified ? (
        <Alert
          tone="info"
          actions={
            <Button
              variant="secondary"
              loading={resend.isPending}
              onClick={() =>
                resend.mutate(undefined, {
                  onSuccess: () => void queryClient.invalidateQueries({ queryKey: qk.me }),
                })
              }
            >
              {t("banner.resend")}
            </Button>
          }
        >
          {resend.isSuccess ? t("banner.resent") : t("banner.emailUnverified")}
        </Alert>
      ) : null}
    </div>
  );
}

export function AppLayout() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const items: NavItem[] = [
    { to: "/", label: t("nav.home"), icon: "home" },
    { to: "/team", label: t("nav.team"), icon: "users", permission: "identity:member:read" },
    { to: "/audit", label: t("nav.audit"), icon: "activity", permission: "audit:log:read" },
    {
      to: "/settings",
      label: t("nav.settings"),
      icon: "settings",
      permission: "tenancy:settings:read",
    },
  ];
  const visible = items.filter((i) => !i.permission || me?.permissions.includes(i.permission));

  const doLogout = async () => {
    await logout("tenant");
    queryClient.clear();
    void navigate({ to: "/login" });
  };

  const nav = (
    <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
      {visible.map((i) => {
        const active = i.to === "/" ? pathname === "/" : pathname.startsWith(i.to);
        return (
          <Link
            key={i.to}
            to={i.to}
            onClick={() => setOpen(false)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-11 items-center gap-3 rounded-control px-3 text-sm outline-none transition-colors",
              "hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-focus",
              active ? "bg-selection text-primary font-semibold" : "text-secondary",
            )}
          >
            <Icon name={i.icon} size={20} className={active ? "text-action-primary" : undefined} />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );

  const brand = (
    <Link
      to="/"
      className="flex items-center gap-2.5 px-2 outline-none focus-visible:outline-2 focus-visible:outline-focus"
    >
      <img src="/brand/nexo-mark.svg" alt="" width={28} height={28} />
      <span className="font-display text-lg font-semibold">{t("app.name")}</span>
    </Link>
  );

  return (
    <div className="bg-canvas text-primary min-h-dvh md:grid md:grid-cols-[240px_1fr]">
      {/* Barra lateral (escritorio) */}
      <aside className="border-line bg-surface hidden border-r md:flex md:flex-col md:gap-6 md:p-4">
        {brand}
        {nav}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="border-line bg-surface sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b px-4">
          <div className="flex items-center gap-2 md:hidden">
            <Button
              variant="ghost"
              aria-label={t("nav.openMenu")}
              aria-expanded={open}
              onClick={() => setOpen(true)}
            >
              <Icon name="menu" />
            </Button>
            {brand}
          </div>
          <p className="text-secondary hidden truncate text-sm md:block">{me?.tenant.name}</p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              onClick={toggle}
              aria-label={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}
            >
              <Icon name={theme === "dark" ? "sun" : "moon"} />
            </Button>
            <Menu
              trigger={
                <Button variant="ghost" aria-label={t("user.menu")} className="gap-2 px-2">
                  <Avatar name={me?.user.fullName ?? "?"} />
                  <span className="hidden max-w-40 truncate text-sm sm:inline">
                    {me?.user.fullName}
                  </span>
                  <Icon name="chevron-down" size={16} />
                </Button>
              }
              items={[
                {
                  key: "settings",
                  label: t("user.settings"),
                  icon: "settings",
                  onSelect: () => void navigate({ to: "/settings" }),
                },
                {
                  key: "logout",
                  label: t("user.logout"),
                  icon: "log-out",
                  onSelect: () => void doLogout(),
                },
              ]}
            />
          </div>
        </header>

        {/* Cajón de navegación (móvil) */}
        {open ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label={t("nav.closeMenu")}
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
            />
            <aside className="bg-surface-raised border-line absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 border-r p-4 shadow-elevation-2">
              <div className="flex items-center justify-between">
                {brand}
                <Button
                  variant="ghost"
                  aria-label={t("nav.closeMenu")}
                  onClick={() => setOpen(false)}
                >
                  <Icon name="close" />
                </Button>
              </div>
              {nav}
            </aside>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-8">
          <AccountBanners />
          <div className="mt-4">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
