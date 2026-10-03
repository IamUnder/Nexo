/** Reglas de activación (MODULES_SPEC §8.3). Dominio puro: sin I/O. */

export const IMPORT_TARGET = 50;
export const INVITE_TARGET = 3;

/** Pasos que hoy se pueden cumplir. El buzón depende del módulo de comunicación (aún no existe). */
export const AVAILABLE_STEPS = [
  "import_50_records",
  "invited_3_users",
  "deal_created_or_moved",
  "project_from_deal",
] as const;

/** Activación = todos los pasos disponibles cumplidos. */
export function isActivated(reached: ReadonlySet<string>): boolean {
  return AVAILABLE_STEPS.every((k) => reached.has(k));
}

/** Pasos que se alcanzan con el contador acumulado. */
export function counterMilestones(importedTotal: number, invitedTotal: number): string[] {
  const out: string[] = [];
  if (importedTotal >= IMPORT_TARGET) out.push("import_50_records");
  if (invitedTotal >= INVITE_TARGET) out.push("invited_3_users");
  return out;
}
