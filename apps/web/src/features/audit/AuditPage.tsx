import { Alert, EmptyState, Skeleton, Table, Td, THead, Th, Tr } from "@nexo/ui";
import { useTranslation } from "react-i18next";
import { errorMessage } from "../../shared/api/errors";
import { useAudit, useMe } from "../../shared/api/queries";

export function AuditPage() {
  const { t } = useTranslation("audit");
  const { t: tc } = useTranslation();
  const { data: me } = useMe();
  const audit = useAudit();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-10 font-bold">{t("title")}</h1>
        <p className="text-secondary mt-1 text-base">{t("subtitle")}</p>
      </div>

      {audit.isLoading ? <Skeleton className="h-64" /> : null}
      {audit.isError ? <Alert tone="error">{errorMessage(tc, audit.error)}</Alert> : null}
      {audit.data && audit.data.items.length === 0 ? (
        <EmptyState icon="activity" title={t("empty")} description={t("emptyHint")} />
      ) : null}
      {audit.data && audit.data.items.length > 0 ? (
        <Table label={t("table")}>
          <THead>
            <Tr>
              <Th>{t("when")}</Th>
              <Th>{t("action")}</Th>
              <Th className="hidden sm:table-cell">{t("who")}</Th>
            </Tr>
          </THead>
          <tbody>
            {audit.data.items.map((e) => (
              <Tr key={e.id}>
                <Td className="text-secondary tabular whitespace-nowrap">
                  <time dateTime={e.occurredAt}>
                    {new Date(e.occurredAt).toLocaleString(me?.tenant.locale ?? "es-ES", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </Td>
                <Td>{t(`actions.${e.action}`, { defaultValue: e.action })}</Td>
                <Td className="text-secondary hidden sm:table-cell">
                  {t(`source.${e.actorSource}`, { defaultValue: e.actorSource })}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </div>
  );
}
