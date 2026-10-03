import type { Tx } from "../../../platform/db/database";

/** Filtros comunes de lectura (el tenant va explícito además de por RLS). */
export interface Filters {
  tenantId: string;
  ownerId?: string | undefined;
  pipelineId?: string | undefined;
}

/** Lectura de los read models para el panel de ventas (la implementa `infrastructure/`). */
export interface InsightsReader {
  openPipeline(
    tx: Tx,
    f: Filters,
    now: Date,
  ): Promise<{
    count: number;
    amountCents: number;
    weightedAmountCents: number;
    stalledCount: number;
  }>;
  closedSince(
    tx: Tx,
    f: Filters,
    since: Date,
  ): Promise<{
    won: { count: number; amountCents: number };
    lost: { count: number; amountCents: number };
  }>;
  avgCycleDays(tx: Tx, f: Filters, since: Date): Promise<number | null>;
  byStage(
    tx: Tx,
    f: Filters,
  ): Promise<Array<{ stageId: string; stageName: string; count: number; amountCents: number }>>;
  wonByMonth(
    tx: Tx,
    f: Filters,
    from: Date,
  ): Promise<Array<{ month: string; amountCents: number }>>;
  forecastByMonth(
    tx: Tx,
    f: Filters,
    from: Date,
    to: Date,
  ): Promise<Array<{ month: string; weightedAmountCents: number }>>;
  activityByKind(
    tx: Tx,
    f: Filters,
    sinceDay: string,
  ): Promise<Array<{ kind: string; count: number }>>;
  lostReasons(tx: Tx, f: Filters, since: Date): Promise<Array<{ reason: string; count: number }>>;
  mainCurrency(tx: Tx, tenantId: string): Promise<string>;
}
