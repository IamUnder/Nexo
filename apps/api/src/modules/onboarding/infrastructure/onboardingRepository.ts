import { eq, sql } from "drizzle-orm";
import type { Tx } from "../../../platform/db/database";
import type { OnboardingRepository, ProgressRow } from "../application/ports";
import { milestones, progress } from "./schema";

const cols = {
  dismissed: progress.dismissed,
  activatedAt: progress.activatedAt,
  importedTotal: progress.importedTotal,
  invitedTotal: progress.invitedTotal,
};

export class DbOnboardingRepository implements OnboardingRepository {
  async getProgress(tx: Tx, tenantId: string): Promise<ProgressRow | null> {
    const [row] = await tx.select(cols).from(progress).where(eq(progress.tenantId, tenantId));
    return row ?? null;
  }

  async listMilestones(tx: Tx, tenantId: string) {
    return tx
      .select({ key: milestones.key, reachedAt: milestones.reachedAt })
      .from(milestones)
      .where(eq(milestones.tenantId, tenantId));
  }

  async setDismissed(tx: Tx, tenantId: string, dismissed: boolean) {
    await tx
      .insert(progress)
      .values({ tenantId, dismissed })
      .onConflictDoUpdate({ target: progress.tenantId, set: { dismissed } });
  }

  async insertMilestone(tx: Tx, tenantId: string, key: string, at: Date) {
    await tx.insert(milestones).values({ tenantId, key, reachedAt: at }).onConflictDoNothing();
  }

  async addImported(tx: Tx, tenantId: string, count: number): Promise<ProgressRow> {
    const [row] = await tx
      .insert(progress)
      .values({ tenantId, importedTotal: count })
      .onConflictDoUpdate({
        target: progress.tenantId,
        set: { importedTotal: sql`${progress.importedTotal} + ${count}` },
      })
      .returning(cols);
    if (!row) throw new Error("No se pudo actualizar el progreso");
    return row;
  }

  async addInvited(tx: Tx, tenantId: string): Promise<ProgressRow> {
    const [row] = await tx
      .insert(progress)
      .values({ tenantId, invitedTotal: 1 })
      .onConflictDoUpdate({
        target: progress.tenantId,
        set: { invitedTotal: sql`${progress.invitedTotal} + 1` },
      })
      .returning(cols);
    if (!row) throw new Error("No se pudo actualizar el progreso");
    return row;
  }

  async markActivated(tx: Tx, tenantId: string, at: Date) {
    await tx
      .insert(progress)
      .values({ tenantId, activatedAt: at })
      .onConflictDoUpdate({
        target: progress.tenantId,
        set: {
          activatedAt: sql`coalesce(${progress.activatedAt}, ${at.toISOString()}::timestamptz)`,
        },
      });
  }
}
