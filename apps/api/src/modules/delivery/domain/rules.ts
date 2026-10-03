/** Reglas de Delivery Lite (MODULES_SPEC §5.3). Dominio puro: sin I/O. */

/** Plantilla por defecto de un proyecto creado desde un deal ganado (configurable más adelante). */
export const DEFAULT_TEMPLATE = {
  milestones: ["Kickoff", "Ejecución", "Entrega"],
  /** `milestone` = índice en `milestones`; `dueInDays` = días desde el inicio. */
  tasks: [
    { title: "Reunión de kickoff con el cliente", milestone: 0, dueInDays: 3 },
    { title: "Confirmar alcance, plazos y responsables", milestone: 0, dueInDays: 5 },
    { title: "Preparar el plan de trabajo", milestone: 1, dueInDays: 10 },
    { title: "Revisión intermedia con el cliente", milestone: 1, dueInDays: 30 },
    { title: "Entrega y cierre con el cliente", milestone: 2, dueInDays: 60 },
  ],
} as const;

export const addDays = (isoDate: string, days: number): string => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export interface TaskLite {
  status: string;
  dueOn: string | null;
}

/** ¿Está vencida? Una tarea no hecha cuya fecha es anterior a hoy. */
export const isOverdue = (t: TaskLite, today: string): boolean =>
  t.status !== "done" && t.dueOn !== null && t.dueOn < today;

/**
 * Salud automática (regla simple y explicable, no «IA»): con alguna tarea bloqueada → `off_track`;
 * con alguna vencida → `at_risk`; si no, `on_track`.
 */
export function computeHealth(
  tasks: TaskLite[],
  today: string,
): "on_track" | "at_risk" | "off_track" {
  if (tasks.some((t) => t.status === "blocked")) return "off_track";
  if (tasks.some((t) => isOverdue(t, today))) return "at_risk";
  return "on_track";
}

/** Estado derivado: un proyecto activo con salud ≠ `on_track` pasa a `at_risk`/`blocked`; no toca los cerrados. */
export function deriveStatus(
  current: string,
  health: "on_track" | "at_risk" | "off_track",
): string {
  if (current === "done" || current === "cancelled" || current === "planned") return current;
  if (health === "off_track") return "blocked";
  if (health === "at_risk") return "at_risk";
  return "in_progress";
}
