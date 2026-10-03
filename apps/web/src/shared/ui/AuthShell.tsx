import { Button, Icon } from "@nexo/ui";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../theme";

/** Marco de las pantallas de acceso: centrado, con logo y selector de tema (DESIGN_SYSTEM §7). */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string | undefined;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();
  return (
    <main className="bg-canvas text-primary flex min-h-dvh flex-col px-4 py-6">
      <header className="mx-auto flex w-full max-w-md items-center justify-between">
        <div className="flex items-center gap-2.5">
          <img src="/brand/nexo-mark.svg" alt="" width={32} height={32} />
          <span className="font-display text-lg font-semibold">{t("app.name")}</span>
        </div>
        <Button
          variant="ghost"
          onClick={toggle}
          aria-label={theme === "dark" ? t("theme.toLight") : t("theme.toDark")}
        >
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </Button>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
        <div className="rounded-modal border border-line bg-surface p-6 shadow-elevation-1 sm:p-8">
          <h1 className="font-display text-2xl leading-8 font-bold">{title}</h1>
          {subtitle ? <p className="text-secondary mt-1.5 text-sm">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </div>
        {footer ? <div className="text-secondary mt-4 text-center text-sm">{footer}</div> : null}
      </div>
    </main>
  );
}
