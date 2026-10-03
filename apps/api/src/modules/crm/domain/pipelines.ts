/**
 * Reglas de pipelines y etapas (MODULES_SPEC §3.3). Dominio puro: sin I/O.
 *
 * Un pipeline tiene etapas ABIERTAS en orden, seguidas de exactamente una etapa GANADA (100 %) y una
 * PERDIDA (0 %). Esas dos son las que cierran la oportunidad; no se pueden eliminar ni duplicar.
 */
export type StageKind = "open" | "won" | "lost";

export interface StageDef {
  id?: string | undefined;
  name: string;
  probability: number;
  kind: StageKind;
}

export type StageProblem =
  | "needs_open_stage"
  | "needs_one_won"
  | "needs_one_lost"
  | "duplicate_name"
  | "empty_name";

/** Plantilla por defecto de un pipeline de servicios B2B (se adapta en el hito 7 con la plantilla vertical). */
export const DEFAULT_STAGES: readonly StageDef[] = [
  { name: "Prospecto", probability: 10, kind: "open" },
  { name: "Cualificado", probability: 25, kind: "open" },
  { name: "Propuesta", probability: 50, kind: "open" },
  { name: "Negociación", probability: 75, kind: "open" },
  { name: "Ganada", probability: 100, kind: "won" },
  { name: "Perdida", probability: 0, kind: "lost" },
];

export function validateStages(stages: readonly StageDef[]): StageProblem | null {
  if (stages.some((s) => s.name.trim() === "")) return "empty_name";
  const names = stages.map((s) => s.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "duplicate_name";
  if (!stages.some((s) => s.kind === "open")) return "needs_open_stage";
  if (stages.filter((s) => s.kind === "won").length !== 1) return "needs_one_won";
  if (stages.filter((s) => s.kind === "lost").length !== 1) return "needs_one_lost";
  return null;
}

/**
 * Ordena (abiertas en el orden recibido → ganada → perdida), fuerza las probabilidades de cierre
 * (100 % / 0 %) y acota las abiertas a 0-99 %. Devuelve las etapas con su `position`.
 */
export function normalizeStages(
  stages: readonly StageDef[],
): Array<StageDef & { position: number }> {
  const open = stages.filter((s) => s.kind === "open");
  const won = stages.find((s) => s.kind === "won");
  const lost = stages.find((s) => s.kind === "lost");
  const ordered: StageDef[] = [
    ...open.map((s) => ({
      ...s,
      probability: Math.min(99, Math.max(0, Math.round(s.probability))),
    })),
    ...(won ? [{ ...won, probability: 100 }] : []),
    ...(lost ? [{ ...lost, probability: 0 }] : []),
  ];
  return ordered.map((s, position) => ({ ...s, name: s.name.trim(), position }));
}

export type DealStatus = "open" | "won" | "lost";

export function statusForStageKind(kind: StageKind): DealStatus {
  return kind;
}
