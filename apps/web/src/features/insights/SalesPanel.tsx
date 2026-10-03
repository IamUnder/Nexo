import { INSIGHTS_PERIODS, type OverviewDto } from "@nexo/contracts";
import { Badge, Card, CardHeader, EmptyState, Select, Skeleton } from "@nexo/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../shared/api/client";
import { useCan, useMe } from "../../shared/api/queries";

function useOverview(period: string) {
  return useQuery({
    queryKey: ["insights", "overview", period],
    queryFn: () => api<OverviewDto>(`/insights/overview?period=${period}`),
    // Los read models se alimentan por eventos (asíncrono): siempre se vuelve a pedir al entrar.
    staleTime: 0,
    refetchInterval: 8_000,
  });
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string | undefined }) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-secondary text-sm">{label}</p>
      <p className="font-display tabular text-[28px] leading-9 font-bold">{value}</p>
      {hint ? <p className="text-secondary text-xs">{hint}</p> : null}
    </Card>
  );
}

/** Barras horizontales accesibles: cada barra lleva su valor escrito (el color no es el único canal). */
function Bars({
  rows,
  format,
  label,
}: {
  rows: Array<{ key: string; label: string; value: number }>;
  format: (v: number) => string;
  label: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5" aria-label={label}>
      {rows.map((r) => (
        <li
          key={r.key}
          className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm"
        >
          <span className="truncate">{r.label}</span>
          <span className="bg-selection h-2.5 overflow-hidden rounded-full" aria-hidden="true">
            <span
              className="bg-action-primary block h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className="tabular text-secondary text-xs">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Panel de ventas del hito 7 (MODULES_SPEC §7.2): pipeline, conversión, ciclo, previsión y actividad. */
export function SalesPanel() {
  const { t } = useTranslation("insights");
  const { t: tcrm } = useTranslation("crm");
  const canRead = useCan("insights:dashboard:read");
  const { data: me } = useMe();
  const [period, setPeriod] = useState<(typeof INSIGHTS_PERIODS)[number]>("90d");
  const overview = useOverview(period);
  if (!canRead || !me) return null;

  const locale = me.tenant.locale;
  const o = overview.data;
  const money = (cents: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency: o?.currency ?? "EUR",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  const monthLabel = (m: string) =>
    new Date(`${m}-01T00:00:00Z`).toLocaleDateString(locale, { month: "short", timeZone: "UTC" });
  const pct = (v: number | null) =>
    v === null
      ? "—"
      : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(v);

  return (
    <section aria-labelledby="sales-panel-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sales-panel-title" className="font-display text-xl font-semibold">
          {t("title")}
        </h2>
        <Select
          aria-label={t("period.label")}
          value={period}
          onChange={(e) => setPeriod(e.target.value as typeof period)}
          className="w-48"
        >
          {INSIGHTS_PERIODS.map((p) => (
            <option key={p} value={p}>
              {t(`period.${p}`)}
            </option>
          ))}
        </Select>
      </div>

      {overview.isLoading || !o ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label={t("kpi.pipeline")}
              value={money(o.pipeline.amountCents)}
              hint={t("kpi.pipelineHint", { count: o.pipeline.count })}
            />
            <Kpi
              label={t("kpi.weighted")}
              value={money(o.pipeline.weightedAmountCents)}
              hint={t("kpi.weightedHint")}
            />
            <Kpi
              label={t("kpi.conversion")}
              value={pct(o.conversionRate)}
              hint={t("kpi.conversionHint", { won: o.won.count, lost: o.lost.count })}
            />
            <Kpi
              label={t("kpi.cycle")}
              value={
                o.avgCycleDays === null ? "—" : t("kpi.days", { count: Math.round(o.avgCycleDays) })
              }
              hint={t("kpi.cycleHint")}
            />
          </div>

          {o.pipeline.stalledCount > 0 ? (
            <p className="flex items-center gap-2 text-sm">
              <Badge tone="warning">{t("stalled.badge")}</Badge>
              <Link to="/crm/deals" className="underline-offset-2 hover:underline">
                {t("stalled.text", { count: o.pipeline.stalledCount })}
              </Link>
            </p>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader title={t("byStage.title")} description={t("byStage.description")} />
              {o.byStage.length === 0 ? (
                <EmptyState icon="briefcase" title={t("byStage.empty")} />
              ) : (
                <Bars
                  label={t("byStage.title")}
                  rows={o.byStage.map((s) => ({
                    key: s.stageId,
                    label: `${s.stageName} (${s.count})`,
                    value: s.amountCents,
                  }))}
                  format={money}
                />
              )}
            </Card>

            <Card>
              <CardHeader title={t("revenue.title")} description={t("revenue.description")} />
              <Bars
                label={t("revenue.title")}
                rows={o.wonByMonth.map((m) => ({
                  key: m.month,
                  label: monthLabel(m.month),
                  value: m.amountCents,
                }))}
                format={money}
              />
            </Card>

            <Card>
              <CardHeader title={t("forecast.title")} description={t("forecast.description")} />
              <Bars
                label={t("forecast.title")}
                rows={o.forecastByMonth.map((m) => ({
                  key: m.month,
                  label: monthLabel(m.month),
                  value: m.weightedAmountCents,
                }))}
                format={money}
              />
            </Card>

            <Card>
              <CardHeader title={t("activity.title")} description={t("activity.description")} />
              {o.activity.length === 0 ? (
                <EmptyState icon="activity" title={t("activity.empty")} />
              ) : (
                <Bars
                  label={t("activity.title")}
                  rows={o.activity.map((a) => ({
                    key: a.kind,
                    label: tcrm(`activity.kind.${a.kind}`, { defaultValue: a.kind }),
                    value: a.count,
                  }))}
                  format={(v) => String(v)}
                />
              )}
              {o.lostReasons.length > 0 ? (
                <div className="mt-5">
                  <h3 className="font-display mb-2 text-sm font-semibold">{t("lost.title")}</h3>
                  <Bars
                    label={t("lost.title")}
                    rows={o.lostReasons.map((r) => ({
                      key: r.reason,
                      label: r.reason,
                      value: r.count,
                    }))}
                    format={(v) => String(v)}
                  />
                </div>
              ) : null}
            </Card>
          </div>
        </>
      )}
    </section>
  );
}
