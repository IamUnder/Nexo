import type { OnboardingDto, OnboardingStepKey } from "@nexo/contracts";
import { Badge, Button, Card, CardHeader, Icon } from "@nexo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { api } from "../../shared/api/client";
import { useCan } from "../../shared/api/queries";

const KEY = ["onboarding"] as const;

/** Pantalla real a la que lleva cada paso (nunca un manual). */
const TARGET: Record<OnboardingStepKey, "/import" | "/team" | "/crm/deals" | null> = {
  import_50_records: "/import",
  invited_3_users: "/team",
  deal_created_or_moved: "/crm/deals",
  project_from_deal: "/crm/deals",
  mailbox_connected: null,
};

/** Checklist de activación: refleja lo que de verdad ha pasado, es descartable y retomable. */
export function OnboardingChecklist() {
  const { t } = useTranslation("onboarding");
  const canManage = useCan("onboarding:checklist:manage");
  const canRead = useCan("onboarding:checklist:read");
  const qc = useQueryClient();
  const state = useQuery({
    queryKey: KEY,
    queryFn: () => api<OnboardingDto>("/onboarding"),
    enabled: canRead,
    staleTime: 0,
    refetchInterval: 15_000,
  });
  const toggle = useMutation({
    mutationFn: (dismiss: boolean) =>
      api(`/onboarding/${dismiss ? "dismiss" : "restore"}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  if (!canRead || !state.data) return null;
  const o = state.data;

  if (o.dismissed) {
    return canManage ? (
      <div>
        <Button variant="ghost" onClick={() => toggle.mutate(false)}>
          {t("restore")}
        </Button>
      </div>
    ) : null;
  }

  const counted = o.steps.filter((s) => s.available);
  const doneCount = counted.filter((s) => s.done).length;
  return (
    <Card>
      <CardHeader
        title={o.activated ? t("activated") : t("title")}
        description={t("progress", { done: doneCount, total: counted.length })}
        actions={
          canManage ? (
            <Button variant="ghost" onClick={() => toggle.mutate(true)}>
              {t("dismiss")}
            </Button>
          ) : undefined
        }
      />
      <ul className="flex flex-col gap-2" aria-label={t("title")}>
        {o.steps.map((s) => {
          const target = TARGET[s.key];
          return (
            <li
              key={s.key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-divider p-3"
            >
              <span className="flex items-center gap-3 text-sm">
                <Icon
                  name={s.done ? "check-circle" : "clock"}
                  className={s.done ? "text-success" : "text-secondary"}
                />
                <span className={s.done ? "text-secondary line-through" : undefined}>
                  {t(`steps.${s.key}`)}
                  {!s.done && s.target ? (
                    <span className="text-secondary tabular">
                      {" "}
                      ({s.current}/{s.target})
                    </span>
                  ) : null}
                </span>
              </span>
              {s.done ? null : !s.available ? (
                <Badge tone="neutral">{t("soon")}</Badge>
              ) : target ? (
                <Link to={target}>
                  <Button variant="secondary">{t("go")}</Button>
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
