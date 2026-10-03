import {
  type ActivityDto,
  activityLoggedV1,
  type CreateActivityInput,
  type CreateTaskInput,
  EVENT_TYPES,
  type SearchResult,
  type TaskDto,
  taskEventV1,
  type UpdateTaskInput,
} from "@nexo/contracts";
import { AppError, ForbiddenError } from "../../../platform/errors";
import type { TenantContext } from "../../../platform/tenant/context";
import {
  type Access,
  type CrmDeps,
  emit,
  nameMap,
  notFound,
  ownerOnly,
  toActivityDto,
  toTaskDto,
} from "./shared";

/** Actividad (timeline), tareas y búsqueda global. */
export class ActivityService {
  constructor(private readonly d: CrmDeps) {}

  /**
   * Registra una actividad manual (nota, llamada, reunión, email). Si cuelga de una oportunidad o contacto,
   * se enlaza también con su empresa para que aparezca en la ficha de la cuenta.
   */
  async create(
    ctx: TenantContext,
    access: Access,
    input: CreateActivityInput,
  ): Promise<ActivityDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      let { accountId, contactId, dealId } = {
        accountId: input.accountId ?? null,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
      };
      const own = ownerOnly(ctx, access);

      if (dealId) {
        const deal = await this.d.repo.findDeal(tx, dealId, own);
        if (!deal) throw notFound("oportunidad");
        accountId ??= deal.accountId;
        contactId ??= deal.primaryContactId;
      }
      if (contactId) {
        const contact = await this.d.repo.findContact(tx, contactId, own);
        if (!contact) throw notFound("contacto");
        accountId ??= contact.accountId;
      }
      if (accountId && !(await this.d.repo.findAccount(tx, accountId, own)))
        throw notFound("empresa");

      const id = await this.d.repo.insertActivity(tx, {
        tenantId: ctx.tenantId,
        kind: input.kind,
        subject: input.subject,
        body: input.body ?? null,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : this.d.clock.now(),
        authorMembershipId: ctx.actor.membershipId,
        accountId,
        contactId,
        dealId,
        source: ctx.actor.source,
      });
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.activityLogged,
        { type: "activity", id },
        activityLoggedV1.parse({
          activityId: id,
          kind: input.kind,
          accountId,
          contactId,
          dealId,
          source: ctx.actor.source,
        }),
      );
      const [row] = await this.d.repo
        .listActivities(tx, {
          accountId: accountId ?? undefined,
          contactId: contactId ?? undefined,
          dealId: dealId ?? undefined,
          limit: 200,
        })
        .then((r) => r.filter((a) => a.id === id));
      if (!row) throw notFound("actividad");
      return toActivityDto(row, await nameMap(this.d, tx, [row.authorMembershipId]));
    });
  }

  async list(
    ctx: TenantContext,
    access: Access,
    q: {
      accountId?: string | undefined;
      contactId?: string | undefined;
      dealId?: string | undefined;
      limit: number;
    },
  ): Promise<ActivityDto[]> {
    return this.d.database.withTenant(ctx, async (tx) => {
      // El alcance `own` solo permite ver la actividad de registros propios.
      const own = ownerOnly(ctx, access);
      if (own) {
        if (q.dealId && !(await this.d.repo.findDeal(tx, q.dealId, own)))
          throw notFound("oportunidad");
        if (q.contactId && !(await this.d.repo.findContact(tx, q.contactId, own)))
          throw notFound("contacto");
        if (q.accountId && !(await this.d.repo.findAccount(tx, q.accountId, own)))
          throw notFound("empresa");
        if (!q.dealId && !q.contactId && !q.accountId) return [];
      }
      const rows = await this.d.repo.listActivities(tx, q);
      const names = await nameMap(
        this.d,
        tx,
        rows.map((r) => r.authorMembershipId),
      );
      return rows.map((r) => toActivityDto(r, names));
    });
  }

  // ── Tareas ──────────────────────────────────────────────────────────────────────────────────
  async createTask(ctx: TenantContext, access: Access, input: CreateTaskInput): Promise<TaskDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const self = ctx.actor.membershipId;
      const assignee = input.assigneeId ?? self;
      if (assignee) {
        if (access.scope === "own" && assignee !== self)
          throw new ForbiddenError("Solo puedes asignarte tareas a ti");
        if (!(await this.d.members.isActiveMember(tx, assignee)))
          throw new AppError("crm.invalid_owner", 400, "El asignado no es un miembro activo");
      }
      const own = ownerOnly(ctx, access);
      if (input.dealId && !(await this.d.repo.findDeal(tx, input.dealId, own)))
        throw notFound("oportunidad");
      if (input.contactId && !(await this.d.repo.findContact(tx, input.contactId, own)))
        throw notFound("contacto");
      if (input.accountId && !(await this.d.repo.findAccount(tx, input.accountId, own)))
        throw notFound("empresa");

      const id = await this.d.repo.insertTask(tx, {
        tenantId: ctx.tenantId,
        title: input.title,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
        priority: input.priority,
        assigneeMembershipId: assignee ?? null,
        createdByMembershipId: self,
        accountId: input.accountId ?? null,
        contactId: input.contactId ?? null,
        dealId: input.dealId ?? null,
      });
      const row = await this.d.repo.findTask(tx, id);
      if (!row) throw notFound("tarea");
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.taskCreated,
        { type: "task", id },
        taskEventV1.parse(taskPayload(row)),
      );
      return toTaskDto(row, await nameMap(this.d, tx, [row.assigneeMembershipId]));
    });
  }

  async listTasks(
    ctx: TenantContext,
    access: Access,
    q: {
      status?: "open" | "done" | undefined;
      assignee: "me" | "all";
      accountId?: string | undefined;
      dealId?: string | undefined;
      limit: number;
    },
  ): Promise<TaskDto[]> {
    return this.d.database.withTenant(ctx, async (tx) => {
      // `own` solo ve las suyas aunque pida «todas».
      const mine = q.assignee === "me" || access.scope === "own";
      const rows = await this.d.repo.listTasks(tx, {
        ...q,
        assigneeMembershipId: mine ? (ctx.actor.membershipId ?? undefined) : undefined,
      });
      const names = await nameMap(
        this.d,
        tx,
        rows.map((r) => r.assigneeMembershipId),
      );
      return rows.map((r) => toTaskDto(r, names));
    });
  }

  private async mutableTask(
    tx: Parameters<Parameters<CrmDeps["database"]["withTenant"]>[1]>[0],
    ctx: TenantContext,
    access: Access,
    id: string,
  ) {
    const row = await this.d.repo.findTask(tx, id);
    // Con alcance `own` solo se tocan las tareas propias; la ajena se trata como inexistente.
    if (!row || (access.scope === "own" && row.assigneeMembershipId !== ctx.actor.membershipId))
      throw notFound("tarea");
    return row;
  }

  async updateTask(
    ctx: TenantContext,
    access: Access,
    id: string,
    input: UpdateTaskInput,
  ): Promise<TaskDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      await this.mutableTask(tx, ctx, access, id);
      const patch: Parameters<typeof this.d.repo.updateTask>[2] = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.assigneeId !== undefined) {
        if (access.scope === "own" && input.assigneeId !== ctx.actor.membershipId)
          throw new ForbiddenError("Solo puedes asignarte tareas a ti");
        if (!(await this.d.members.isActiveMember(tx, input.assigneeId)))
          throw new AppError("crm.invalid_owner", 400, "El asignado no es un miembro activo");
        patch.assigneeMembershipId = input.assigneeId;
      }
      await this.d.repo.updateTask(tx, id, patch);
      const row = await this.d.repo.findTask(tx, id);
      if (!row) throw notFound("tarea");
      return toTaskDto(row, await nameMap(this.d, tx, [row.assigneeMembershipId]));
    });
  }

  /** Completar/reabrir. Al completar se emite `crm.task.completed` (lo usará Insights). */
  async setTaskDone(
    ctx: TenantContext,
    access: Access,
    id: string,
    done: boolean,
  ): Promise<TaskDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const current = await this.mutableTask(tx, ctx, access, id);
      if ((current.status === "done") === done)
        return toTaskDto(current, await nameMap(this.d, tx, [current.assigneeMembershipId]));
      await this.d.repo.updateTask(tx, id, {
        status: done ? "done" : "open",
        completedAt: done ? this.d.clock.now() : null,
      });
      const row = await this.d.repo.findTask(tx, id);
      if (!row) throw notFound("tarea");
      if (done)
        await emit(
          this.d,
          tx,
          ctx,
          EVENT_TYPES.taskCompleted,
          { type: "task", id },
          taskEventV1.parse(taskPayload(row)),
        );
      return toTaskDto(row, await nameMap(this.d, tx, [row.assigneeMembershipId]));
    });
  }

  async deleteTask(ctx: TenantContext, access: Access, id: string): Promise<void> {
    await this.d.database.withTenant(ctx, async (tx) => {
      await this.mutableTask(tx, ctx, access, id);
      await this.d.repo.deleteTask(tx, id);
    });
  }

  // ── Búsqueda global ─────────────────────────────────────────────────────────────────────────
  async search(ctx: TenantContext, access: Access, q: string): Promise<SearchResult[]> {
    return this.d.database.withTenant(ctx, (tx) =>
      this.d.repo.search(tx, q, ownerOnly(ctx, access)),
    );
  }
}

function taskPayload(t: {
  id: string;
  title: string;
  assigneeMembershipId: string | null;
  dealId: string | null;
  accountId: string | null;
}) {
  return {
    taskId: t.id,
    title: t.title,
    assigneeId: t.assigneeMembershipId,
    dealId: t.dealId,
    accountId: t.accountId,
  };
}
