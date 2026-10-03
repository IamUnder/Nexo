/**
 * Estado de un tenant (MODULES_SPEC §2.1). El estado ALMACENADO lo cambia el superadmin o Stripe; el
 * estado EFECTIVO se calcula con la hora: una prueba caducada «bloquea de verdad» aunque la fila siga
 * en `trial` (no es un aviso, ARCHITECTURE §7.2).
 */
export const STORED_STATUSES = ["trial", "active", "past_due", "suspended", "cancelled"] as const;
export type StoredStatus = (typeof STORED_STATUSES)[number];
export type EffectiveStatus = StoredStatus | "trial_expired";

/** Días de gracia con `past_due` antes de bloquear (configurable; MODULES_SPEC §2.1 «por defecto 7»). */
export const PAST_DUE_GRACE_DAYS = 7;

export interface StatusInput {
  status: string;
  trialEndsAt: Date | null;
  /** Cuándo pasó a `past_due`, para calcular la gracia. */
  pastDueSince?: Date | null;
}

export function effectiveStatus(t: StatusInput, now: Date): EffectiveStatus {
  if (t.status === "trial" && t.trialEndsAt && t.trialEndsAt.getTime() <= now.getTime()) {
    return "trial_expired";
  }
  return t.status as StoredStatus;
}

/** ¿Puede el tenant operar con normalidad (todas las funciones)? */
export function canOperate(status: EffectiveStatus, pastDueSince: Date | null, now: Date): boolean {
  switch (status) {
    case "trial":
    case "active":
      return true;
    case "past_due": {
      if (!pastDueSince) return true;
      const graceMs = PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;
      return now.getTime() - pastDueSince.getTime() <= graceMs;
    }
    default:
      return false; // trial_expired · suspended · cancelled
  }
}

export function isStoredStatus(value: string): value is StoredStatus {
  return (STORED_STATUSES as readonly string[]).includes(value);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
