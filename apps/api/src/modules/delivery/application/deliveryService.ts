import {
  type CreateProjectInput,
  type DealWonV1,
  type DeliveryTaskDto,
  deliveryTaskEventV1,
  EVENT_TYPES,
  type MilestoneDto,
  type ProjectDetailDto,
  type ProjectDto,
  projectEventV1,
  projectStatusChangedV1,
  type TimeEntryDto,
  timeLoggedV1,
  type UpdateProjectInput,
} from "@nexo/contracts";
import type { Database, Tx } from "../../../platform/db/database";
import { AppError, NotFoundError } from "../../../platform/errors";
import { publishEvent } from "../../../platform/events/outbox";
import { uuidv7 } from "../../../platform/ids";
import type { AuditLogger, Clock } from "../../../platform/ports";
import type { TenantContext } from "../../../platform/tenant/context";
import { addDays, computeHealth, DEFAULT_TEMPLATE, deriveStatus, isOverdue } from "../domain/rules";
import type {
  DeliveryRepository,
  MemberDirectory,
  MilestoneRow,
  ProjectRow,
  TaskRow,
  TimeRow,
} from "./ports";

const notFound = (what: string) => new NotFoundError(what);
type EventKey = keyof typeof EVENT_TYPES;

export class DeliveryService {
  constructor(
    private readonly d: {
      database: Database;
      repo: DeliveryRepository;
      members: MemberDirectory;
      audit: AuditLogger;
      clock: Clock;
    },
  ) {}

  private today(): string {
    return this.d.clock.now().toISOString().slice(0, 10);
  }

  private async emit(
    tx: Tx,
    ctx: TenantContext,
    key: EventKey,
    entity: { type: string; id: string },
    payload: unknown,
  ) {
    await publishEvent(tx, {
      id: uuidv7(),
      ...EVENT_TYPES[key],
      tenantId: ctx.tenantId,
      occurredAt: this.d.clock.now().toISOString(),
      actor: ctx.actor,
      entity,
      payload,
    });
  }

  private async names(tx: Tx, ids: Array<string | null | undefined>) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    return unique.length > 0 ? this.d.members.names(tx, unique) : new Map<string, string>();
  }

  private toProject(p: ProjectRow, names: Map<string, string>): ProjectDto {
    // Las tareas vencidas ponen en riesgo un proyecto activo aunque nadie lo haya tocado hoy.
    const active = !["planned", "done", "cancelled"].includes(p.status);
    const atRisk = active && p.tasksOverdue > 0 && p.health === "on_track";
    return {
      id: p.id,
      name: p.name,
      status: (atRisk && p.status === "in_progress" ? "at_risk" : p.status) as ProjectDto["status"],
      health: (atRisk ? "at_risk" : p.health) as ProjectDto["health"],
      accountId: p.accountId,
      accountName: p.accountName,
      accountArchived: p.accountArchived,
      sourceDealId: p.sourceDealId,
      ownerId: p.ownerMembershipId,
      ownerName: p.ownerMembershipId ? (names.get(p.ownerMembershipId) ?? null) : null,
      startsOn: p.startsOn,
      dueOn: p.dueOn,
      summary: p.summary,
      tasksTotal: p.tasksTotal,
      tasksDone: p.tasksDone,
      tasksOverdue: p.tasksOverdue,
      minutesLogged: p.minutesLogged,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  private toTask(t: TaskRow, names: Map<string, string>, today: string): DeliveryTaskDto {
    return {
      id: t.id,
      projectId: t.projectId,
      milestoneId: t.milestoneId,
      title: t.title,
      description: t.description,
      status: t.status as DeliveryTaskDto["status"],
      assigneeId: t.assigneeMembershipId,
      assigneeName: t.assigneeMembershipId ? (names.get(t.assigneeMembershipId) ?? null) : null,
      dueOn: t.dueOn,
      position: t.position,
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      overdue: isOverdue(t, today),
    };
  }

  private toMilestone(m: MilestoneRow): MilestoneDto {
    return { ...m, status: m.status as MilestoneDto["status"] };
  }

  private toTime(t: TimeRow, names: Map<string, string>): TimeEntryDto {
    return {
      id: t.id,
      projectId: t.projectId,
      taskId: t.taskId,
      membershipId: t.membershipId,
      membershipName: t.membershipId ? (names.get(t.membershipId) ?? null) : null,
      minutes: t.minutes,
      workedOn: t.workedOn,
      note: t.note,
    };
  }

  private projectEvent(p: ProjectRow) {
    return projectEventV1.parse({
      projectId: p.id,
      name: p.name,
      status: p.status,
      health: p.health,
      accountId: p.accountId,
      ownerId: p.ownerMembershipId,
      sourceDealId: p.sourceDealId,
    });
  }

  private async mustProject(tx: Tx, id: string): Promise<ProjectRow> {
    const p = await this.d.repo.findProject(tx, id, this.today());
    if (!p) throw notFound("proyecto");
    return p;
  }

  private async validMember(tx: Tx, id: string | undefined | null) {
    if (id && !(await this.d.members.isActiveMember(tx, id))) {
      throw new AppError(
        "delivery.invalid_member",
        400,
        "La persona elegida no es un miembro activo",
      );
    }
  }

  // ── Proyecto desde un deal ganado (idempotente por `source_deal_id`) ─────────────────────────
  async createFromDeal(tx: Tx, ctx: TenantContext, deal: DealWonV1): Promise<void> {
    const today = this.today();
    if (await this.d.repo.findProjectByDeal(tx, deal.dealId, today)) return;

    const owner =
      deal.ownerId && (await this.d.members.isActiveMember(tx, deal.ownerId)) ? deal.ownerId : null;
    const amount = `${(deal.amountCents / 100).toFixed(2)} ${deal.currency}`;
    const contacts = deal.contacts
      .map((c) => `${c.name}${c.email ? ` <${c.email}>` : ""}`)
      .join(", ");
    const summary = [
      `Origen: oportunidad ganada «${deal.name}» (${amount}).`,
      deal.scope ? `Alcance: ${deal.scope}` : null,
      contacts ? `Contactos: ${contacts}.` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const projectId = await this.d.repo.insertProject(tx, {
      tenantId: ctx.tenantId,
      name: deal.name,
      status: "planned",
      accountId: deal.accountId,
      accountName: deal.accountName,
      sourceDealId: deal.dealId,
      ownerMembershipId: owner,
      startsOn: today,
      dueOn: addDays(today, 60),
      summary,
    });

    const milestoneIds: string[] = [];
    for (const [i, name] of DEFAULT_TEMPLATE.milestones.entries()) {
      milestoneIds.push(
        await this.d.repo.insertMilestone(tx, {
          tenantId: ctx.tenantId,
          projectId,
          name,
          dueOn: addDays(today, [5, 40, 60][i] ?? 60),
        }),
      );
    }
    for (const t of DEFAULT_TEMPLATE.tasks) {
      await this.d.repo.insertTask(tx, {
        tenantId: ctx.tenantId,
        projectId,
        milestoneId: milestoneIds[t.milestone] ?? null,
        title: t.title,
        description: null,
        assigneeMembershipId: owner,
        dueOn: addDays(today, t.dueInDays),
      });
    }
    const project = await this.mustProject(tx, projectId);
    await this.emit(
      tx,
      ctx,
      "projectCreated",
      { type: "project", id: projectId },
      this.projectEvent(project),
    );
    await this.d.audit.record(tx, ctx, {
      action: "delivery.project_created",
      entityType: "project",
      entityId: projectId,
      after: { sourceDealId: deal.dealId, name: deal.name },
    });
  }

  /** Mantiene el nombre de la empresa del CRM (snapshot) o marca la cuenta como archivada. */
  async syncAccount(tx: Tx, accountId: string, name: string | null): Promise<void> {
    if (name) await this.d.repo.syncAccountName(tx, accountId, name);
    else await this.d.repo.archiveAccount(tx, accountId);
  }

  // ── Proyectos ───────────────────────────────────────────────────────────────────────────────
  async create(ctx: TenantContext, input: CreateProjectInput): Promise<ProjectDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const owner = input.ownerId ?? ctx.actor.membershipId;
      await this.validMember(tx, owner);
      const id = await this.d.repo.insertProject(tx, {
        tenantId: ctx.tenantId,
        name: input.name,
        status: "planned",
        accountId: input.accountId ?? null,
        accountName: input.accountName ?? null,
        sourceDealId: null,
        ownerMembershipId: owner ?? null,
        startsOn: input.startsOn ?? null,
        dueOn: input.dueOn ?? null,
        summary: input.summary ?? null,
      });
      const p = await this.mustProject(tx, id);
      await this.emit(tx, ctx, "projectCreated", { type: "project", id }, this.projectEvent(p));
      return this.toProject(p, await this.names(tx, [p.ownerMembershipId]));
    });
  }

  async list(
    ctx: TenantContext,
    q: { accountId?: string | undefined; status?: string | undefined; limit: number },
  ): Promise<ProjectDto[]> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const rows = await this.d.repo.listProjects(tx, { ...q, today: this.today() });
      const names = await this.names(
        tx,
        rows.map((r) => r.ownerMembershipId),
      );
      return rows.map((r) => this.toProject(r, names));
    });
  }

  async detail(ctx: TenantContext, id: string): Promise<ProjectDetailDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const today = this.today();
      const p = await this.mustProject(tx, id);
      const [ms, ts, time] = await Promise.all([
        this.d.repo.listMilestones(tx, id),
        this.d.repo.listTasks(tx, id),
        this.d.repo.listTime(tx, id, 100),
      ]);
      const names = await this.names(tx, [
        p.ownerMembershipId,
        ...ts.map((t) => t.assigneeMembershipId),
        ...time.map((t) => t.membershipId),
      ]);
      return {
        project: this.toProject(p, names),
        milestones: ms.map((m) => this.toMilestone(m)),
        tasks: ts.map((t) => this.toTask(t, names, today)),
        time: time.map((t) => this.toTime(t, names)),
      };
    });
  }

  async update(ctx: TenantContext, id: string, input: UpdateProjectInput): Promise<ProjectDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const before = await this.mustProject(tx, id);
      await this.validMember(tx, input.ownerId);
      await this.d.repo.updateProject(tx, id, {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.health !== undefined ? { health: input.health } : {}),
        ...(input.ownerId !== undefined ? { ownerMembershipId: input.ownerId } : {}),
        ...(input.startsOn !== undefined ? { startsOn: input.startsOn } : {}),
        ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}),
        ...(input.summary !== undefined ? { summary: input.summary } : {}),
      });
      const after = await this.mustProject(tx, id);
      await this.emit(tx, ctx, "projectUpdated", { type: "project", id }, this.projectEvent(after));
      if (after.status !== before.status) await this.statusChanged(tx, ctx, after, before.status);
      return this.toProject(after, await this.names(tx, [after.ownerMembershipId]));
    });
  }

  private async statusChanged(tx: Tx, ctx: TenantContext, p: ProjectRow, from: string) {
    await this.emit(
      tx,
      ctx,
      "projectStatusChanged",
      { type: "project", id: p.id },
      projectStatusChangedV1.parse({ ...this.projectEvent(p), fromStatus: from }),
    );
    if (p.status === "done") {
      await this.emit(
        tx,
        ctx,
        "projectCompleted",
        { type: "project", id: p.id },
        this.projectEvent(p),
      );
    }
  }

  /** Recalcula salud y estado a partir de las tareas (regla simple y explicable). */
  private async refresh(tx: Tx, ctx: TenantContext, projectId: string) {
    const p = await this.mustProject(tx, projectId);
    const ts = await this.d.repo.listTasks(tx, projectId);
    const health = computeHealth(ts, this.today());
    const status = deriveStatus(p.status, health);
    if (health === p.health && status === p.status) return;
    await this.d.repo.updateProject(tx, projectId, { health, status });
    if (status !== p.status) {
      await this.statusChanged(tx, ctx, { ...p, health, status }, p.status);
    }
  }

  // ── Hitos ───────────────────────────────────────────────────────────────────────────────────
  async addMilestone(
    ctx: TenantContext,
    projectId: string,
    input: { name: string; dueOn?: string | undefined },
  ): Promise<MilestoneDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      await this.mustProject(tx, projectId);
      const id = await this.d.repo.insertMilestone(tx, {
        tenantId: ctx.tenantId,
        projectId,
        name: input.name,
        dueOn: input.dueOn ?? null,
      });
      const m = await this.d.repo.findMilestone(tx, id);
      if (!m) throw notFound("hito");
      return this.toMilestone(m);
    });
  }

  async updateMilestone(
    ctx: TenantContext,
    id: string,
    input: {
      name?: string | undefined;
      dueOn?: string | null | undefined;
      status?: string | undefined;
    },
  ): Promise<MilestoneDto> {
    const patch = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
    return this.d.database.withTenant(ctx, async (tx) => {
      if (!(await this.d.repo.findMilestone(tx, id))) throw notFound("hito");
      await this.d.repo.updateMilestone(tx, id, patch);
      const m = await this.d.repo.findMilestone(tx, id);
      if (!m) throw notFound("hito");
      return this.toMilestone(m);
    });
  }

  // ── Tareas ──────────────────────────────────────────────────────────────────────────────────
  async addTask(
    ctx: TenantContext,
    projectId: string,
    input: {
      title: string;
      description?: string | undefined;
      milestoneId?: string | undefined;
      assigneeId?: string | undefined;
      dueOn?: string | undefined;
    },
  ): Promise<DeliveryTaskDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      await this.mustProject(tx, projectId);
      await this.validMember(tx, input.assigneeId);
      if (input.milestoneId) {
        const m = await this.d.repo.findMilestone(tx, input.milestoneId);
        if (!m || m.projectId !== projectId) throw notFound("hito");
      }
      const id = await this.d.repo.insertTask(tx, {
        tenantId: ctx.tenantId,
        projectId,
        milestoneId: input.milestoneId ?? null,
        title: input.title,
        description: input.description ?? null,
        assigneeMembershipId: input.assigneeId ?? null,
        dueOn: input.dueOn ?? null,
      });
      const t = await this.d.repo.findTask(tx, id);
      if (!t) throw notFound("tarea");
      await this.emit(
        tx,
        ctx,
        "deliveryTaskCreated",
        { type: "delivery_task", id },
        deliveryTaskEventV1.parse({
          taskId: id,
          projectId,
          title: t.title,
          assigneeId: t.assigneeMembershipId,
        }),
      );
      await this.refresh(tx, ctx, projectId);
      return this.toTask(t, await this.names(tx, [t.assigneeMembershipId]), this.today());
    });
  }

  async updateTask(
    ctx: TenantContext,
    id: string,
    input: {
      title?: string | undefined;
      description?: string | null | undefined;
      status?: string | undefined;
      milestoneId?: string | null | undefined;
      assigneeId?: string | null | undefined;
      dueOn?: string | null | undefined;
    },
  ): Promise<DeliveryTaskDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const before = await this.d.repo.findTask(tx, id);
      if (!before) throw notFound("tarea");
      await this.validMember(tx, input.assigneeId);
      if (input.milestoneId) {
        const m = await this.d.repo.findMilestone(tx, input.milestoneId);
        if (!m || m.projectId !== before.projectId) throw notFound("hito");
      }
      const completing = input.status === "done" && before.status !== "done";
      await this.d.repo.updateTask(tx, id, {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.status !== undefined
          ? {
              status: input.status,
              completedAt: input.status === "done" ? this.d.clock.now() : null,
            }
          : {}),
        ...(input.milestoneId !== undefined ? { milestoneId: input.milestoneId } : {}),
        ...(input.assigneeId !== undefined ? { assigneeMembershipId: input.assigneeId } : {}),
        ...(input.dueOn !== undefined ? { dueOn: input.dueOn } : {}),
      });
      const t = await this.d.repo.findTask(tx, id);
      if (!t) throw notFound("tarea");
      if (completing) {
        await this.emit(
          tx,
          ctx,
          "deliveryTaskCompleted",
          { type: "delivery_task", id },
          deliveryTaskEventV1.parse({
            taskId: id,
            projectId: t.projectId,
            title: t.title,
            assigneeId: t.assigneeMembershipId,
          }),
        );
      }
      await this.refresh(tx, ctx, t.projectId);
      return this.toTask(t, await this.names(tx, [t.assigneeMembershipId]), this.today());
    });
  }

  async deleteTask(ctx: TenantContext, id: string): Promise<void> {
    await this.d.database.withTenant(ctx, async (tx) => {
      const t = await this.d.repo.findTask(tx, id);
      if (!t) throw notFound("tarea");
      await this.d.repo.deleteTask(tx, id);
      await this.refresh(tx, ctx, t.projectId);
    });
  }

  // ── Tiempo ──────────────────────────────────────────────────────────────────────────────────
  async logTime(
    ctx: TenantContext,
    projectId: string,
    input: {
      taskId?: string | undefined;
      minutes: number;
      workedOn?: string | undefined;
      note?: string | undefined;
    },
  ): Promise<TimeEntryDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      await this.mustProject(tx, projectId);
      if (input.taskId) {
        const t = await this.d.repo.findTask(tx, input.taskId);
        if (!t || t.projectId !== projectId) throw notFound("tarea");
      }
      const id = await this.d.repo.insertTime(tx, {
        tenantId: ctx.tenantId,
        projectId,
        taskId: input.taskId ?? null,
        membershipId: ctx.actor.membershipId,
        minutes: input.minutes,
        workedOn: input.workedOn ?? this.today(),
        note: input.note ?? null,
      });
      await this.emit(
        tx,
        ctx,
        "timeLogged",
        { type: "time_entry", id },
        timeLoggedV1.parse({
          entryId: id,
          projectId,
          taskId: input.taskId ?? null,
          minutes: input.minutes,
          membershipId: ctx.actor.membershipId,
        }),
      );
      const rows = await this.d.repo.listTime(tx, projectId, 100);
      const row = rows.find((r) => r.id === id);
      if (!row) throw notFound("registro de tiempo");
      return this.toTime(row, await this.names(tx, [row.membershipId]));
    });
  }
}
