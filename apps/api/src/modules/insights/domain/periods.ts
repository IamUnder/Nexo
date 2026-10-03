/** Dominio puro de Insights: periodos y series mensuales (sin I/O; todo en UTC). */

export type Period = "30d" | "90d" | "365d";

const DAYS: Record<Period, number> = { "30d": 30, "90d": 90, "365d": 365 };
export const DAY_MS = 86_400_000;

/** Inicio del periodo: `now` menos N días. */
export function periodStart(period: Period, now: Date): Date {
  return new Date(now.getTime() - DAYS[period] * DAY_MS);
}

/** `YYYY-MM` de una fecha (UTC). */
export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Los `count` meses que terminan en el mes de `now` (incluido), del más antiguo al actual. */
export function lastMonths(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - i), 1))),
  );
}

/** El mes de `now` y los `count - 1` siguientes. */
export function nextMonths(now: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))),
  );
}

/** Rellena con 0 los meses sin datos, conservando el orden de `months`. */
export function fillMonths<T extends { month: string }>(
  months: string[],
  rows: T[],
  empty: (month: string) => T,
): T[] {
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return months.map((m) => byMonth.get(m) ?? empty(m));
}

/** Ganadas / (ganadas + perdidas); `null` si no hubo cierres. */
export function conversionRate(won: number, lost: number): number | null {
  const total = won + lost;
  return total === 0 ? null : won / total;
}
