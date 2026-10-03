import { Button, EmptyState } from "@nexo/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="bg-canvas text-primary flex min-h-dvh items-center justify-center p-4">
      <EmptyState
        icon="search"
        title={t("notFound.title")}
        description={t("notFound.description")}
        action={
          <Link to="/">
            <Button>{t("notFound.action")}</Button>
          </Link>
        }
      />
    </main>
  );
}
