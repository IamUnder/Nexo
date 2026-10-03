import type { DealStatus, StageKind } from "./pipelines";

/**
 * Reglas de oportunidades (MODULES_SPEC §3.3). Dominio puro.
 */
export type DealProblem =
  | "lost_reason_required"
  | "closed_amount_locked"
  | "already_closed"
  | "not_closed"
  | "next_action_required"
  | "stage_pipeline_mismatch";

/** Siguiente acción: obligatoria en oportunidades ABIERTAS cuando el tenant lo exige (por defecto sí, PDF §04). */
export function checkNextAction(args: {
  required: boolean;
  status: DealStatus;
  nextActionAt: Date | null | undefined;
  nextActionText: string | null | undefined;
}): DealProblem | null {
  if (!args.required || args.status !== "open") return null;
  const hasText = (args.nextActionText ?? "").trim().length > 0;
  return args.nextActionAt || hasText ? null : "next_action_required";
}

/** Mover entre etapas: abierta→abierta libre; a «perdida» exige motivo; desde cerrada hay que reabrir. */
export function checkMove(args: {
  fromStatus: DealStatus;
  toKind: StageKind;
  lostReason: string | undefined;
}): DealProblem | null {
  if (args.fromStatus !== "open") return "already_closed";
  if (args.toKind === "lost" && (args.lostReason ?? "").trim().length < 2)
    return "lost_reason_required";
  return null;
}

export function checkReopen(status: DealStatus): DealProblem | null {
  return status === "open" ? "not_closed" : null;
}

/** Una oportunidad ganada es inmutable en importe salvo con `crm:deal:manage` (MODULES_SPEC §3.3). */
export function checkAmountChange(args: {
  status: DealStatus;
  amountChanged: boolean;
  canManage: boolean;
}): DealProblem | null {
  return args.status === "won" && args.amountChanged && !args.canManage
    ? "closed_amount_locked"
    : null;
}

/** Ponderado de una oportunidad: importe × probabilidad. Céntimos enteros, redondeo al más cercano. */
export function weightedCents(amountCents: number, probability: number): number {
  return Math.round((amountCents * probability) / 100);
}
