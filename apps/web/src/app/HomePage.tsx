import { Button, Icon } from "@nexo/ui";
import { useTranslation } from "react-i18next";
import { useTheme } from "./theme";

/** Pantalla de arranque del hito 0. Sirve de smoke test visual de tokens, i18n y tema. */
export function HomePage() {
  const { t } = useTranslation();
  const { theme, toggle } = useTheme();

  return (
    <main className="mx-auto flex min-h-dvh max-w-[1440px] flex-col px-4 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
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

      <section className="my-auto flex max-w-xl flex-col gap-4 py-16">
        <h1 className="font-display text-[32px] leading-10 font-bold">{t("home.title")}</h1>
        <p className="text-secondary text-base leading-6">{t("home.description")}</p>
        <div>
          <Button>
            <Icon name="plus" />
            {t("home.primaryAction")}
          </Button>
        </div>
        <p className="text-secondary text-xs">{t("app.tagline")}</p>
      </section>
    </main>
  );
}
