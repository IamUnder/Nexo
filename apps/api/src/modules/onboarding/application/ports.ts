import type { Tx } from "../../../platform/db/database";

export interface ProgressRow {
  dismissed: boolean;
  activatedAt: Date | null;
  importedTotal: number;
  invitedTotal: number;
}

/** Persistencia del onboarding (la implementa `infrastructure/`). */
export interface OnboardingRepository {
  getProgress(tx: Tx, tenantId: string): Promise<ProgressRow | null>;
  listMilestones(tx: Tx, tenantId: string): Promise<Array<{ key: string; reachedAt: Date }>>;
  setDismissed(tx: Tx, tenantId: string, dismissed: boolean): Promise<void>;
  /** Registra el hito una sola vez (idempotente). */
  insertMilestone(tx: Tx, tenantId: string, key: string, at: Date): Promise<void>;
  addImported(tx: Tx, tenantId: string, count: number): Promise<ProgressRow>;
  addInvited(tx: Tx, tenantId: string): Promise<ProgressRow>;
  /** Fija la fecha de activación solo si aún no estaba. */
  markActivated(tx: Tx, tenantId: string, at: Date): Promise<void>;
}
