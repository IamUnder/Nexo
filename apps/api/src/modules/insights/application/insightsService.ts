import type { OverviewDto, OverviewQuery } from "@nexo/contracts";
import type { Database } from "../../../platform/db/database";
import type { Clock } from "../../../platform/ports";
import type { TenantContext } from "../../../platform/tenant/context";
import { conversionRate, fillMonths, lastMonths, nextMonths, periodStart } from "../domain/periods";
import type { InsightsReader } from "./ports";

/**
 * Panel de ventas (MODULES_SPEC §7.2). Solo lee los read models propios; con alcance `own` calcula
 * únicamente las métricas del propio usuario, con `all` las del equipo (y admite filtrar por propietario).
 */
export class InsightsService {
  constructor(private readonly d: { database: Database; repo: InsightsReader; clock: Clock }) {}

  async overview(
    ctx: TenantContext,
    access: { scope: "own" | "all" },
    q: OverviewQuery,
  ): Promise<OverviewDto> {
    const now = this.d.clock.now();
    const since = periodStart(q.period, now);
    const months = lastMonths(now, 8);
    const forecastMonths = nextMonths(now, 4);
    const [fy, fm] = (forecastMonths[forecastMonths.length - 1] ?? "").split("-").map(Number);
    const forecastEnd = new Date(Date.UTC(fy ?? 1970, fm ?? 0, 1)); // primer día del mes siguiente al último
    const firstMonth = months[0] ?? "";
    const [y0, m0] = firstMonth.split("-").map(Number);
    const wonFrom = new Date(Date.UTC(y0 ?? 1970, (m0 ?? 1) - 1, 1));
    const forecastFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const owner = access.scope === "own" ? (ctx.actor.membershipId ?? undefined) : q.ownerId;
    const f = { tenantId: ctx.tenantId, ownerId: owner, pipelineId: q.pipelineId };
    const sinceDay = since.toISOString().slice(0, 10);

    return this.d.database.withTenant(ctx, async (tx) => {
      const r = this.d.repo;
      const [pipeline, closed, cycle, byStage, won, forecast, activity, lostReasons, currency] =
        await Promise.all([
          r.openPipeline(tx, f, now),
          r.closedSince(tx, f, since),
          r.avgCycleDays(tx, f, since),
          r.byStage(tx, f),
          r.wonByMonth(tx, f, wonFrom),
          r.forecastByMonth(tx, f, forecastFrom, forecastEnd),
          r.activityByKind(tx, f, sinceDay),
          r.lostReasons(tx, f, since),
          r.mainCurrency(tx, ctx.tenantId),
        ]);
      return {
        period: q.period,
        since: since.toISOString(),
        pipeline,
        won: closed.won,
        lost: closed.lost,
        conversionRate: conversionRate(closed.won.count, closed.lost.count),
        avgCycleDays: cycle,
        byStage,
        wonByMonth: fillMonths(months, won, (month) => ({ month, amountCents: 0 })),
        forecastByMonth: fillMonths(forecastMonths, forecast, (month) => ({
          month,
          weightedAmountCents: 0,
        })),
        activity,
        lostReasons,
        currency,
      };
    });
  }
}
