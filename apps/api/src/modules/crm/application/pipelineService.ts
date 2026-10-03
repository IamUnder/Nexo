import type { PipelineDto, SetStagesInput } from "@nexo/contracts";
import type { Tx } from "../../../platform/db/database";
import { AppError } from "../../../platform/errors";
import type { TenantContext } from "../../../platform/tenant/context";
import { DEFAULT_STAGES, normalizeStages, validateStages } from "../domain/pipelines";
import type { PipelineRow } from "./ports";
import { type CrmDeps, notFound, toPipelineDto } from "./shared";

/** Pipelines y etapas. La plantilla por defecto se crea sola; el hito 7 la sustituye por la del vertical elegido. */
export class PipelineService {
  constructor(private readonly d: CrmDeps) {}

  /** Garantiza que el tenant tiene un pipeline por defecto (idempotente y seguro ante carreras). */
  async ensureDefault(tx: Tx, tenantId: string): Promise<PipelineRow> {
    const existing = await this.d.repo.defaultPipeline(tx);
    if (existing) return existing;
    const id = await this.d.repo.insertPipeline(tx, {
      tenantId,
      name: "Ventas",
      isDefault: true,
      position: 0,
      stages: normalizeStages(DEFAULT_STAGES),
    });
    const created = await this.d.repo.findPipeline(tx, id);
    if (!created) throw notFound("pipeline");
    return created;
  }

  async list(ctx: TenantContext): Promise<PipelineDto[]> {
    return this.d.database.withTenant(ctx, async (tx) => {
      await this.ensureDefault(tx, ctx.tenantId);
      return (await this.d.repo.listPipelines(tx)).map(toPipelineDto);
    });
  }

  async create(ctx: TenantContext, name: string): Promise<PipelineDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      await this.ensureDefault(tx, ctx.tenantId);
      const existing = await this.d.repo.listPipelines(tx);
      const id = await this.d.repo.insertPipeline(tx, {
        tenantId: ctx.tenantId,
        name,
        isDefault: false,
        position: existing.length,
        stages: normalizeStages(DEFAULT_STAGES),
      });
      const row = await this.d.repo.findPipeline(tx, id);
      if (!row) throw notFound("pipeline");
      await this.d.audit.record(tx, ctx, {
        action: "crm.pipeline_created",
        entityType: "pipeline",
        entityId: id,
        after: { name },
      });
      return toPipelineDto(row);
    });
  }

  /**
   * Sustituye las etapas de un pipeline. Reglas: ≥ 1 abierta + exactamente una ganada y una perdida;
   * no se puede eliminar una etapa que tenga oportunidades (hay que moverlas antes).
   */
  async setStages(
    ctx: TenantContext,
    pipelineId: string,
    input: SetStagesInput,
  ): Promise<PipelineDto> {
    const invalid = validateStages(input.stages);
    if (invalid)
      throw new AppError("crm.invalid_stages", 400, `Etapas no válidas (${invalid})`, {
        problem: invalid,
      });
    const normalized = normalizeStages(input.stages);

    return this.d.database.withTenant(ctx, async (tx) => {
      const current = await this.d.repo.findPipeline(tx, pipelineId);
      if (!current) throw notFound("pipeline");

      const keep = new Set(normalized.map((s) => s.id).filter((x): x is string => !!x));
      for (const s of current.stages) {
        if (!keep.has(s.id) && s.dealsCount > 0) {
          throw new AppError(
            "crm.stage_has_deals",
            409,
            `La etapa «${s.name}» tiene oportunidades`,
            { stage: s.name },
          );
        }
      }
      // Los ids recibidos deben pertenecer a ESTE pipeline (nunca crear/mover etapas ajenas).
      const own = new Set(current.stages.map((s) => s.id));
      if (normalized.some((s) => s.id && !own.has(s.id))) throw notFound("etapa");

      if (input.name && input.name !== current.name)
        await this.d.repo.renamePipeline(tx, pipelineId, input.name);
      await this.d.repo.syncStages(tx, ctx.tenantId, pipelineId, normalized);
      const updated = await this.d.repo.findPipeline(tx, pipelineId);
      if (!updated) throw notFound("pipeline");
      await this.d.audit.record(tx, ctx, {
        action: "crm.pipeline_stages_updated",
        entityType: "pipeline",
        entityId: pipelineId,
        before: { stages: current.stages.map((s) => s.name) },
        after: { stages: updated.stages.map((s) => s.name) },
      });
      return toPipelineDto(updated);
    });
  }
}
