import {
  type CreateDealInput,
  type DealDto,
  dealEventV1,
  dealLostV1,
  dealStageChangedV1,
  dealWonV1,
  EVENT_TYPES,
  type UpdateDealInput,
} from "@nexo/contracts";
import type { Tx } from "../../../platform/db/database";
import { AppError } from "../../../platform/errors";
import type { TenantContext } from "../../../platform/tenant/context";
import { checkAmountChange, checkMove, checkNextAction, checkReopen } from "../domain/deals";
import type { PipelineService } from "./pipelineService";
import type { DealRow, PipelineRow } from "./ports";
import {
  type Access,
  type CrmDeps,
  dealProblemError,
  emit,
  nameMap,
  notFound,
  ownerOnly,
  REQUIRE_NEXT_ACTION,
  resolveOwner,
  toDealDto,
} from "./shared";

/** Oportunidades: embudo, ganar/perder/reabrir y los eventos que consumen otros módulos (`crm.deal.won`). */
export class DealService {
  constructor(
    private readonly d: CrmDeps,
    private readonly pipelines: PipelineService,
  ) {}

  private base(row: DealRow) {
    return {
      dealId: row.id,
      name: row.name,
      accountId: row.accountId,
      accountName: row.accountName,
      pipelineId: row.pipelineId,
      stageId: row.stageId,
      amountCents: Number(row.amountCents),
      currency: row.currency,
      ownerId: row.ownerMembershipId,
      status: row.status,
      stageName: row.stageName,
      probability: row.probability,
      expectedCloseOn: row.expectedCloseOn,
      createdAt: row.createdAt.toISOString(),
      closedAt: row.closedAt ? row.closedAt.toISOString() : null,
    };
  }

  private async load(tx: Tx, ctx: TenantContext, access: Access, id: string): Promise<DealRow> {
    const row = await this.d.repo.findDeal(tx, id, ownerOnly(ctx, access));
    if (!row) throw notFound("oportunidad");
    return row;
  }

  private async dto(tx: Tx, row: DealRow): Promise<DealDto> {
    return toDealDto(row, await nameMap(this.d, tx, [row.ownerMembershipId]));
  }

  async create(ctx: TenantContext, access: Access, input: CreateDealInput): Promise<DealDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const account = await this.d.repo.findAccount(tx, input.accountId, ownerOnly(ctx, access));
      if (!account) throw notFound("empresa");
      if (input.primaryContactId && !(await this.d.repo.findContact(tx, input.primaryContactId)))
        throw notFound("contacto");

      const pipeline = input.pipelineId
        ? await this.d.repo.findPipeline(tx, input.pipelineId)
        : await this.pipelines.ensureDefault(tx, ctx.tenantId);
      if (!pipeline) throw notFound("pipeline");
      const stage = input.stageId
        ? pipeline.stages.find((s) => s.id === input.stageId)
        : pipeline.stages.find((s) => s.kind === "open");
      if (!stage || stage.kind !== "open")
        throw new AppError("validation.failed", 400, "Etapa de inicio no válida");

      const problem = checkNextAction({
        required: REQUIRE_NEXT_ACTION,
        status: "open",
        nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null,
        nextActionText: input.nextActionText,
      });
      if (problem) throw dealProblemError(problem);

      const owner = await resolveOwner(this.d, tx, ctx, access, input.ownerId);
      const id = await this.d.repo.insertDeal(tx, {
        tenantId: ctx.tenantId,
        name: input.name,
        accountId: input.accountId,
        primaryContactId: input.primaryContactId ?? null,
        pipelineId: pipeline.id,
        stageId: stage.id,
        amountCents: input.amountCents,
        currency: input.currency ?? (await this.d.repo.tenantCurrency(tx)),
        probability: stage.probability,
        expectedCloseOn: input.expectedCloseOn ?? null,
        ownerMembershipId: owner,
        nextActionAt: input.nextActionAt ? new Date(input.nextActionAt) : null,
        nextActionText: input.nextActionText ?? null,
      });
      const row = await this.load(tx, ctx, { scope: "all" }, id);
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.dealCreated,
        { type: "deal", id },
        dealEventV1.parse(this.base(row)),
      );
      return this.dto(tx, row);
    });
  }

  async get(ctx: TenantContext, access: Access, id: string): Promise<DealDto> {
    return this.d.database.withTenant(ctx, async (tx) =>
      this.dto(tx, await this.load(tx, ctx, access, id)),
    );
  }

  async list(
    ctx: TenantContext,
    access: Access,
    q: {
      pipelineId?: string | undefined;
      status?: string | undefined;
      accountId?: string | undefined;
      ownerId?: string | undefined;
      search?: string | undefined;
      limit: number;
    },
  ): Promise<DealDto[]> {
    return this.d.database.withTenant(ctx, async (tx) => {
      // Sin pipeline indicado se usa el de por defecto (la vista de embudo).
      const pipelineId =
        q.pipelineId ??
        (q.accountId ? undefined : (await this.pipelines.ensureDefault(tx, ctx.tenantId)).id);
      const rows = await this.d.repo.listDeals(tx, {
        ...q,
        pipelineId,
        ownerOnly: ownerOnly(ctx, access),
      });
      const names = await nameMap(
        this.d,
        tx,
        rows.map((r) => r.ownerMembershipId),
      );
      return rows.map((r) => toDealDto(r, names));
    });
  }

  async update(
    ctx: TenantContext,
    access: Access,
    id: string,
    input: UpdateDealInput,
  ): Promise<DealDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const current = await this.load(tx, ctx, access, id);

      const amountProblem = checkAmountChange({
        status: current.status,
        amountChanged:
          input.amountCents !== undefined && input.amountCents !== Number(current.amountCents),
        canManage: access.canManage === true,
      });
      if (amountProblem) throw dealProblemError(amountProblem);

      const nextAt =
        input.nextActionAt !== undefined
          ? input.nextActionAt
            ? new Date(input.nextActionAt)
            : null
          : current.nextActionAt;
      const nextText =
        input.nextActionText !== undefined ? input.nextActionText : current.nextActionText;
      const naProblem = checkNextAction({
        required: REQUIRE_NEXT_ACTION,
        status: current.status,
        nextActionAt: nextAt,
        nextActionText: nextText,
      });
      if (naProblem) throw dealProblemError(naProblem);

      if (input.primaryContactId && !(await this.d.repo.findContact(tx, input.primaryContactId)))
        throw notFound("contacto");

      const patch: Parameters<typeof this.d.repo.updateDeal>[2] = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.primaryContactId !== undefined) patch.primaryContactId = input.primaryContactId;
      if (input.amountCents !== undefined) patch.amountCents = input.amountCents;
      if (input.expectedCloseOn !== undefined) patch.expectedCloseOn = input.expectedCloseOn;
      if (input.nextActionAt !== undefined) patch.nextActionAt = nextAt;
      if (input.nextActionText !== undefined) patch.nextActionText = nextText;
      if (input.ownerId !== undefined)
        patch.ownerMembershipId = await resolveOwner(this.d, tx, ctx, access, input.ownerId);

      await this.d.repo.updateDeal(tx, id, patch);
      const row = await this.load(tx, ctx, { scope: "all" }, id);
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.dealUpdated,
        { type: "deal", id },
        dealEventV1.parse(this.base(row)),
      );
      return this.dto(tx, row);
    });
  }

  /** Mueve la oportunidad a otra etapa. Ganar y perder tienen sus rutas propias (más reglas). */
  async move(
    ctx: TenantContext,
    access: Access,
    id: string,
    stageId: string,
    reason?: string,
  ): Promise<DealDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const deal = await this.load(tx, ctx, access, id);
      const pipeline = await this.mustPipeline(tx, deal.pipelineId);
      const target = pipeline.stages.find((s) => s.id === stageId);
      if (!target)
        throw new AppError(
          "validation.failed",
          400,
          "La etapa no pertenece al pipeline de la oportunidad",
        );

      const problem = checkMove({
        fromStatus: deal.status,
        toKind: target.kind,
        lostReason: reason,
      });
      if (problem) throw dealProblemError(problem);
      if (target.kind === "won") return this.closeAs(tx, ctx, deal, pipeline, "won");
      if (target.kind === "lost") return this.closeAs(tx, ctx, deal, pipeline, "lost", reason);
      if (target.id === deal.stageId) return this.dto(tx, deal);

      const now = this.d.clock.now();
      await this.d.repo.updateDeal(tx, id, {
        stageId: target.id,
        probability: target.probability,
        stageChangedAt: now,
      });
      await this.d.repo.insertActivity(tx, {
        tenantId: ctx.tenantId,
        kind: "stage_change",
        subject: `${deal.stageName} → ${target.name}`,
        body: null,
        occurredAt: now,
        authorMembershipId: ctx.actor.membershipId,
        accountId: deal.accountId,
        contactId: deal.primaryContactId,
        dealId: id,
        source: ctx.actor.source,
      });
      const row = await this.load(tx, ctx, { scope: "all" }, id);
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.dealStageChanged,
        { type: "deal", id },
        dealStageChangedV1.parse({
          ...this.base(row),
          fromStageId: deal.stageId,
          fromStageName: deal.stageName,
          toStageName: target.name,
        }),
      );
      return this.dto(tx, row);
    });
  }

  async win(ctx: TenantContext, access: Access, id: string): Promise<DealDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const deal = await this.load(tx, ctx, access, id);
      const problem = checkMove({ fromStatus: deal.status, toKind: "won", lostReason: undefined });
      if (problem) throw dealProblemError(problem);
      return this.closeAs(tx, ctx, deal, await this.mustPipeline(tx, deal.pipelineId), "won");
    });
  }

  async lose(ctx: TenantContext, access: Access, id: string, reason: string): Promise<DealDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const deal = await this.load(tx, ctx, access, id);
      const problem = checkMove({ fromStatus: deal.status, toKind: "lost", lostReason: reason });
      if (problem) throw dealProblemError(problem);
      return this.closeAs(
        tx,
        ctx,
        deal,
        await this.mustPipeline(tx, deal.pipelineId),
        "lost",
        reason,
      );
    });
  }

  async reopen(ctx: TenantContext, access: Access, id: string): Promise<DealDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const deal = await this.load(tx, ctx, access, id);
      const problem = checkReopen(deal.status);
      if (problem) throw dealProblemError(problem);
      const pipeline = await this.mustPipeline(tx, deal.pipelineId);
      const first = pipeline.stages.find((s) => s.kind === "open");
      if (!first)
        throw new AppError("crm.invalid_stages", 409, "El pipeline no tiene etapas abiertas");
      const now = this.d.clock.now();
      await this.d.repo.updateDeal(tx, id, {
        stageId: first.id,
        probability: first.probability,
        status: "open",
        lostReason: null,
        closedAt: null,
        stageChangedAt: now,
      });
      await this.d.repo.insertActivity(tx, {
        tenantId: ctx.tenantId,
        kind: "system",
        subject: "Oportunidad reabierta",
        body: null,
        occurredAt: now,
        authorMembershipId: ctx.actor.membershipId,
        accountId: deal.accountId,
        contactId: deal.primaryContactId,
        dealId: id,
        source: ctx.actor.source,
      });
      const row = await this.load(tx, ctx, { scope: "all" }, id);
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.dealUpdated,
        { type: "deal", id },
        dealEventV1.parse(this.base(row)),
      );
      return this.dto(tx, row);
    });
  }

  async delete(ctx: TenantContext, access: Access, id: string): Promise<void> {
    await this.d.database.withTenant(ctx, async (tx) => {
      const deal = await this.load(tx, ctx, access, id);
      await this.d.repo.softDeleteDeal(tx, id);
      await this.d.audit.record(tx, ctx, {
        action: "crm.deal_deleted",
        entityType: "deal",
        entityId: id,
        before: { name: deal.name, amountCents: Number(deal.amountCents), status: deal.status },
      });
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.dealDeleted,
        { type: "deal", id },
        dealEventV1.parse(this.base(deal)),
      );
    });
  }

  // ── Interno ─────────────────────────────────────────────────────────────────────────────────
  private async mustPipeline(tx: Tx, id: string): Promise<PipelineRow> {
    const p = await this.d.repo.findPipeline(tx, id);
    if (!p) throw notFound("pipeline");
    return p;
  }

  /** Cierra la oportunidad (ganada/perdida): etapa final, estado, actividad y evento de dominio. */
  private async closeAs(
    tx: Tx,
    ctx: TenantContext,
    deal: DealRow,
    pipeline: PipelineRow,
    outcome: "won" | "lost",
    reason?: string,
  ): Promise<DealDto> {
    const stage = pipeline.stages.find((s) => s.kind === outcome);
    if (!stage)
      throw new AppError("crm.invalid_stages", 409, "El pipeline no tiene etapa de cierre");
    const now = this.d.clock.now();

    await this.d.repo.updateDeal(tx, deal.id, {
      stageId: stage.id,
      probability: stage.probability,
      status: outcome,
      lostReason: outcome === "lost" ? (reason ?? "").trim() : null,
      closedAt: now,
      stageChangedAt: now,
    });
    await this.d.repo.insertActivity(tx, {
      tenantId: ctx.tenantId,
      kind: "system",
      subject: outcome === "won" ? "Oportunidad ganada" : "Oportunidad perdida",
      body: outcome === "lost" ? (reason ?? null) : null,
      occurredAt: now,
      authorMembershipId: ctx.actor.membershipId,
      accountId: deal.accountId,
      contactId: deal.primaryContactId,
      dealId: deal.id,
      source: ctx.actor.source,
    });

    const row = await this.load(tx, ctx, { scope: "all" }, deal.id);
    if (outcome === "won") {
      const contacts = await this.d.repo.contactsOfAccount(tx, deal.accountId, 10);
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.dealWon,
        { type: "deal", id: deal.id },
        dealWonV1.parse({
          ...this.base(row),
          primaryContactId: row.primaryContactId,
          wonAt: now.toISOString(),
          scope: null,
          contacts: contacts.map((c) => ({
            contactId: c.id,
            name: `${c.firstName} ${c.lastName ?? ""}`.trim(),
            email: c.email,
          })),
        }),
      );
    } else {
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.dealLost,
        { type: "deal", id: deal.id },
        dealLostV1.parse({
          ...this.base(row),
          lostReason: (reason ?? "").trim(),
          lostAt: now.toISOString(),
        }),
      );
    }
    return this.dto(tx, row);
  }
}
