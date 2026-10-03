import type { AuditEntryDto, Page } from "@nexo/contracts";
import { Alert, EmptyState, Skeleton, Table, Td, THead, Th, Tr } from "@nexo/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { qk } from "../../shared/api/queries";

export function AdminAuditPage() {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation();
  const audit = useQuery({
    queryKey: qk.adminAudit,
    queryFn: () => api<Page<AuditEntryDto>>("/admin/audit?limit=100", { scope: "admin" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-[32px] leading-10 font-bold">{t("audit.title")}</h1>
        <p className="text-secondary mt-1 text-base">{t("audit.subtitle")}</p>
      </div>
      {audit.isLoading ? <Skeleton className="h-64" /> : null}
      {audit.isError ? <Alert tone="error">{errorMessage(tc, audit.error)}</Alert> : null}
      {audit.data && audit.data.items.length === 0 ? (
        <EmptyState icon="scroll" title={t("audit.empty")} />
      ) : null}
      {audit.data && audit.data.items.length > 0 ? (
        <Table label={t("audit.table")}>
          <THead>
            <Tr>
              <Th>{t("audit.when")}</Th>
              <Th>{t("audit.action")}</Th>
              <Th className="hidden sm:table-cell">{t("audit.entity")}</Th>
            </Tr>
          </THead>
          <tbody>
            {audit.data.items.map((e) => (
              <Tr key={e.id}>
                <Td className="text-secondary tabular whitespace-nowrap">
                  <time dateTime={e.occurredAt}>
                    {new Date(e.occurredAt).toLocaleString("es-ES", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </time>
                </Td>
                <Td className="font-mono text-xs">{e.action}</Td>
                <Td className="text-secondary hidden sm:table-cell">{e.entityType ?? "—"}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </div>
  );
}
