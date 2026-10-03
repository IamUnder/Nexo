import { z } from "zod";

/** DTOs del módulo Insights (MODULES_SPEC §7). Los importes viajan en céntimos enteros. */
const id = z.string().uuid();

export const INSIGHTS_PERIODS = ["30d", "90d", "365d"] as const;

export const overviewQuerySchema = z.object({
  period: z.enum(INSIGHTS_PERIODS).default("90d"),
  /** Solo para alcance `all`: filtra por propietario. Con alcance `own` se ignora (siempre el propio). */
  ownerId: id.optional(),
  pipelineId: id.optional(),
});
export type OverviewQuery = z.infer<typeof overviewQuerySchema>;

const moneyCount = z.object({ count: z.number().int(), amountCents: z.number().int() });

export const overviewSchema = z.object({
  period: z.enum(INSIGHTS_PERIODS),
  /** Fecha de inicio del periodo (ISO). */
  since: z.string(),
  /** Oportunidades abiertas AHORA. */
  pipeline: z.object({
    count: z.number().int(),
    amountCents: z.number().int(),
    weightedAmountCents: z.number().int(),
    /** Abiertas sin cambio de etapa desde hace más de 14 días. */
    stalledCount: z.number().int(),
  }),
  /** Cerradas en el periodo. */
  won: moneyCount,
  lost: moneyCount,
  /** Ganadas / (ganadas + perdidas) en el periodo, 0..1; `null` si no hay cierres. */
  conversionRate: z.number().min(0).max(1).nullable(),
  /** Días medios desde la creación hasta ganar, en el periodo; `null` si no hay ganadas. */
  avgCycleDays: z.number().nullable(),
  byStage: z.array(
    z.object({
      stageId: id,
      stageName: z.string(),
      count: z.number().int(),
      amountCents: z.number().int(),
    }),
  ),
  /** Ingresos ganados por mes (últimos 8 meses, incluido el actual). `month` = `YYYY-MM`. */
  wonByMonth: z.array(z.object({ month: z.string(), amountCents: z.number().int() })),
  /** Pipeline ponderado por mes de cierre previsto (mes actual y siguientes 3). */
  forecastByMonth: z.array(z.object({ month: z.string(), weightedAmountCents: z.number().int() })),
  activity: z.array(z.object({ kind: z.string(), count: z.number().int() })),
  lostReasons: z.array(z.object({ reason: z.string(), count: z.number().int() })),
  currency: z.string(),
});
export type OverviewDto = z.infer<typeof overviewSchema>;
