import type { DealEventV1 } from "@nexo/contracts";
import { and, eq, type SQL, sql } from "drizzle-orm";
import type { Tx } from "../../../platform/db/database";
import type { Filters, InsightsReader } from "../application/ports";
import { activityDaily, dealFacts, stageHistory } from "./schema";

/** UUID nulo: agrupa la actividad sin autor (sistema/API) para poder usarlo en la clave primaria. */
export const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const num = (v: unknown) => Number(v ?? 0);

/** Filtros comunes sobre `insights_deal_facts` (el tenant va explícito además de por RLS). */
function dealWhere(f: Filters, ...extra: SQL[]): SQL {
  const conds: SQL[] = [sql`tenant_id = ${f.tenantId}`];
  if (f.ownerId) conds.push(sql`owner_id = ${f.ownerId}`);
  if (f.pipelineId) conds.push(sql`pipeline_id = ${f.pipelineId}`);
  conds.push(...extra);
  return sql.join(conds, sql` and `);
}

export class DbInsightsRepository implements InsightsReader {
  // ── Escritura (suscriptores de eventos) ───────────────────────────────────────────────────────
  /**
   * Aplica el estado completo de una oportunidad (los eventos de deal llevan el estado entero).
   * Un evento más antiguo que el último aplicado se ignora: la entrega puede llegar desordenada.
   */
  async upsertDeal(
    tx: Tx,
    tenantId: string,
    p: DealEventV1 & { lostReason?: string | null },
    eventAt: Date,
  ): Promise<void> {
    const values = {
      tenantId,
      dealId: p.dealId,
      name: p.name,
      accountName: p.accountName,
      ownerId: p.ownerId,
      pipelineId: p.pipelineId,
      stageId: p.stageId,
      stageName: p.stageName,
      probability: p.probability,
      amountCents: p.amountCents,
      currency: p.currency,
      status: p.status,
      expectedCloseOn: p.expectedCloseOn,
      createdAt: new Date(p.createdAt),
      closedAt: p.closedAt ? new Date(p.closedAt) : null,
      stageChangedAt: eventAt,
      lostReason: p.lostReason ?? null,
      lastEventAt: eventAt,
    };
    await tx
      .insert(dealFacts)
      .values(values)
      .onConflictDoUpdate({
        target: [dealFacts.tenantId, dealFacts.dealId],
        set: {
          name: values.name,
          accountName: values.accountName,
          ownerId: values.ownerId,
          pipelineId: values.pipelineId,
          stageId: values.stageId,
          stageName: values.stageName,
          probability: values.probability,
          amountCents: values.amountCents,
          currency: values.currency,
          status: values.status,
          expectedCloseOn: values.expectedCloseOn,
          closedAt: values.closedAt,
          lostReason: values.lostReason,
          lastEventAt: values.lastEventAt,
          // La fecha del último cambio de etapa solo avanza si cambió la etapa.
          stageChangedAt: sql`case when ${dealFacts.stageId} <> excluded.stage_id then excluded.stage_changed_at else ${dealFacts.stageChangedAt} end`,
        },
        setWhere: sql`${dealFacts.lastEventAt} <= excluded.last_event_at`,
      });
  }

  async deleteDeal(tx: Tx, tenantId: string, dealId: string): Promise<void> {
    await tx
      .delete(dealFacts)
      .where(and(eq(dealFacts.tenantId, tenantId), eq(dealFacts.dealId, dealId)));
    await tx
      .delete(stageHistory)
      .where(and(eq(stageHistory.tenantId, tenantId), eq(stageHistory.dealId, dealId)));
  }

  async addStageChange(
    tx: Tx,
    v: {
      tenantId: string;
      eventId: string;
      dealId: string;
      fromStageName: string | null;
      toStageName: string;
      occurredAt: Date;
    },
  ): Promise<void> {
    await tx.insert(stageHistory).values(v).onConflictDoNothing();
  }

  async bumpActivity(tx: Tx, tenantId: string, day: string, kind: string, authorId: string | null) {
    await tx
      .insert(activityDaily)
      .values({ tenantId, day, kind, authorId: authorId ?? NIL_UUID, count: 1 })
      .onConflictDoUpdate({
        target: [
          activityDaily.tenantId,
          activityDaily.day,
          activityDaily.kind,
          activityDaily.authorId,
        ],
        set: { count: sql`${activityDaily.count} + 1` },
      });
  }

  // ── Lectura (dashboard) ───────────────────────────────────────────────────────────────────────
  async openPipeline(tx: Tx, f: Filters, now: Date) {
    const stalledBefore = new Date(now.getTime() - 14 * 86_400_000);
    const { rows } = await tx.execute(sql`
      select count(*)::int as count,
             coalesce(sum(amount_cents), 0)::float8 as amount,
             coalesce(sum(amount_cents * probability / 100.0), 0)::float8 as weighted,
             (count(*) filter (where stage_changed_at < ${stalledBefore.toISOString()}::timestamptz))::int as stalled
        from insights_deal_facts
       where ${dealWhere(f, sql`status = 'open'`)}`);
    const r = rows[0] ?? {};
    return {
      count: num(r.count),
      amountCents: Math.round(num(r.amount)),
      weightedAmountCents: Math.round(num(r.weighted)),
      stalledCount: num(r.stalled),
    };
  }

  async closedSince(tx: Tx, f: Filters, since: Date) {
    const { rows } = await tx.execute(sql`
      select status, count(*)::int as count, coalesce(sum(amount_cents), 0)::float8 as amount
        from insights_deal_facts
       where ${dealWhere(f, sql`status in ('won', 'lost')`, sql`closed_at >= ${since.toISOString()}::timestamptz`)}
       group by status`);
    const pick = (status: string) => {
      const r = rows.find((x) => x.status === status);
      return { count: num(r?.count), amountCents: Math.round(num(r?.amount)) };
    };
    return { won: pick("won"), lost: pick("lost") };
  }

  async avgCycleDays(tx: Tx, f: Filters, since: Date): Promise<number | null> {
    const { rows } = await tx.execute(sql`
      select avg(extract(epoch from (closed_at - created_at)) / 86400.0)::float8 as days
        from insights_deal_facts
       where ${dealWhere(f, sql`status = 'won'`, sql`closed_at >= ${since.toISOString()}::timestamptz`)}`);
    const v = rows[0]?.days;
    return v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10;
  }

  async byStage(tx: Tx, f: Filters) {
    const { rows } = await tx.execute(sql`
      select stage_id, stage_name, count(*)::int as count, coalesce(sum(amount_cents), 0)::float8 as amount
        from insights_deal_facts
       where ${dealWhere(f, sql`status = 'open'`)}
       group by stage_id, stage_name
       order by max(probability) asc, stage_name asc`);
    return rows.map((r) => ({
      stageId: String(r.stage_id),
      stageName: String(r.stage_name),
      count: num(r.count),
      amountCents: Math.round(num(r.amount)),
    }));
  }

  async wonByMonth(tx: Tx, f: Filters, from: Date) {
    const { rows } = await tx.execute(sql`
      select to_char(closed_at at time zone 'UTC', 'YYYY-MM') as month,
             coalesce(sum(amount_cents), 0)::float8 as amount
        from insights_deal_facts
       where ${dealWhere(f, sql`status = 'won'`, sql`closed_at >= ${from.toISOString()}::timestamptz`)}
       group by 1`);
    return rows.map((r) => ({ month: String(r.month), amountCents: Math.round(num(r.amount)) }));
  }

  async forecastByMonth(tx: Tx, f: Filters, from: Date, to: Date) {
    const { rows } = await tx.execute(sql`
      select to_char(expected_close_on, 'YYYY-MM') as month,
             coalesce(sum(amount_cents * probability / 100.0), 0)::float8 as weighted
        from insights_deal_facts
       where ${dealWhere(f, sql`status = 'open'`, sql`expected_close_on >= ${from.toISOString().slice(0, 10)}::date`, sql`expected_close_on < ${to.toISOString().slice(0, 10)}::date`)}
       group by 1`);
    return rows.map((r) => ({
      month: String(r.month),
      weightedAmountCents: Math.round(num(r.weighted)),
    }));
  }

  async activityByKind(tx: Tx, f: Filters, sinceDay: string) {
    const conds: SQL[] = [sql`tenant_id = ${f.tenantId}`, sql`day >= ${sinceDay}::date`];
    if (f.ownerId) conds.push(sql`author_id = ${f.ownerId}`);
    const { rows } = await tx.execute(sql`
      select kind, sum(count)::int as count
        from insights_activity_daily
       where ${sql.join(conds, sql` and `)}
       group by kind
       order by count desc`);
    return rows.map((r) => ({ kind: String(r.kind), count: num(r.count) }));
  }

  async lostReasons(tx: Tx, f: Filters, since: Date) {
    const { rows } = await tx.execute(sql`
      select lost_reason as reason, count(*)::int as count
        from insights_deal_facts
       where ${dealWhere(f, sql`status = 'lost'`, sql`lost_reason is not null`, sql`closed_at >= ${since.toISOString()}::timestamptz`)}
       group by lost_reason
       order by count desc, lost_reason asc
       limit 5`);
    return rows.map((r) => ({ reason: String(r.reason), count: num(r.count) }));
  }

  async mainCurrency(tx: Tx, tenantId: string): Promise<string> {
    const { rows } = await tx.execute(sql`
      select currency from insights_deal_facts where tenant_id = ${tenantId}
       group by currency order by count(*) desc limit 1`);
    return rows[0]?.currency ? String(rows[0].currency) : "EUR";
  }
}
