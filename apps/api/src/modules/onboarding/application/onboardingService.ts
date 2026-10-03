import { ONBOARDING_STEPS, type OnboardingDto } from "@nexo/contracts";
import type { Database, Tx } from "../../../platform/db/database";
import type { Clock } from "../../../platform/ports";
import type { TenantContext } from "../../../platform/tenant/context";
import {
  AVAILABLE_STEPS,
  counterMilestones,
  IMPORT_TARGET,
  INVITE_TARGET,
  isActivated,
} from "../domain/activation";
import type { OnboardingRepository, ProgressRow } from "./ports";

/**
 * Checklist de activación. Los hitos se alcanzan por EVENTOS de otros módulos (nunca leyendo sus
 * tablas) y el estado refleja lo que de verdad ha pasado.
 */
export class OnboardingService {
  constructor(
    private readonly d: { database: Database; repo: OnboardingRepository; clock: Clock },
  ) {}

  async get(ctx: TenantContext): Promise<OnboardingDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const p = await this.d.repo.getProgress(tx, ctx.tenantId);
      const ms = await this.d.repo.listMilestones(tx, ctx.tenantId);
      const reached = new Map(ms.map((m) => [m.key, m.reachedAt]));
      return {
        steps: ONBOARDING_STEPS.map((key) => ({
          key,
          done: reached.has(key),
          reachedAt: reached.get(key)?.toISOString() ?? null,
          available: (AVAILABLE_STEPS as readonly string[]).includes(key),
          current:
            key === "import_50_records"
              ? Math.min(p?.importedTotal ?? 0, IMPORT_TARGET)
              : key === "invited_3_users"
                ? Math.min(p?.invitedTotal ?? 0, INVITE_TARGET)
                : null,
          target:
            key === "import_50_records"
              ? IMPORT_TARGET
              : key === "invited_3_users"
                ? INVITE_TARGET
                : null,
        })),
        activated: !!p?.activatedAt,
        activatedAt: p?.activatedAt?.toISOString() ?? null,
        dismissed: p?.dismissed ?? false,
      };
    });
  }

  async setDismissed(ctx: TenantContext, dismissed: boolean): Promise<void> {
    await this.d.database.withTenant(ctx, (tx) =>
      this.d.repo.setDismissed(tx, ctx.tenantId, dismissed),
    );
  }

  // ── Alimentación por eventos (idempotente: cada hito se registra una sola vez) ─────────────────
  async reach(tx: Tx, tenantId: string, key: string, at: Date): Promise<void> {
    await this.d.repo.insertMilestone(tx, tenantId, key, at);
    await this.checkActivation(tx, tenantId, at);
  }

  async addImported(tx: Tx, tenantId: string, count: number, at: Date): Promise<void> {
    await this.afterCounters(tx, tenantId, await this.d.repo.addImported(tx, tenantId, count), at);
  }

  async addInvited(tx: Tx, tenantId: string, at: Date): Promise<void> {
    await this.afterCounters(tx, tenantId, await this.d.repo.addInvited(tx, tenantId), at);
  }

  private async afterCounters(tx: Tx, tenantId: string, row: ProgressRow, at: Date) {
    for (const key of counterMilestones(row.importedTotal, row.invitedTotal)) {
      await this.d.repo.insertMilestone(tx, tenantId, key, at);
    }
    await this.checkActivation(tx, tenantId, at);
  }

  private async checkActivation(tx: Tx, tenantId: string, at: Date) {
    const ms = await this.d.repo.listMilestones(tx, tenantId);
    if (isActivated(new Set(ms.map((m) => m.key)))) {
      await this.d.repo.markActivated(tx, tenantId, at);
    }
  }
}
