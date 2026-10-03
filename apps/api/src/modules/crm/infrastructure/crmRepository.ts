import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Tx } from "../../../platform/db/database";
import { tenants } from "../../../platform/db/schema";
import type {
  AccountRow,
  ActivityRow,
  ContactRow,
  CrmRepository,
  DealRow,
  ListFilter,
  Paged,
  PipelineRow,
  StageRow,
  TaskRow,
} from "../application/ports";
import type { StageDef } from "../domain/pipelines";
import { accounts, activities, contacts, deals, pipelines, stages, tasks } from "./schema";

/** Minúsculas y sin tildes, igual que el índice `nexo_unaccent(lower(...))` de la migración. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Patrón LIKE literal: escapa `%`, `_` y `\` del término buscado. */
const likePattern = (q: string) => `%${fold(q).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const encodeCursor = (at: Date, id: string) =>
  Buffer.from(`${at.toISOString()}|${id}`).toString("base64url");
function decodeCursor(c: string | undefined): { at: Date; id: string } | null {
  if (!c) return null;
  const [at, id] = Buffer.from(c, "base64url").toString().split("|");
  const d = at ? new Date(at) : null;
  return d && !Number.isNaN(d.getTime()) && id ? { at: d, id } : null;
}

const accountCounts = {
  contactsCount: sql<number>`(select count(*)::int from crm_contacts c where c.tenant_id = crm_accounts.tenant_id and c.account_id = crm_accounts.id and c.deleted_at is null)`,
  openDealsCount: sql<number>`(select count(*)::int from crm_deals d where d.tenant_id = crm_accounts.tenant_id and d.account_id = crm_accounts.id and d.status = 'open' and d.deleted_at is null)`,
  openDealsAmountCents: sql<number>`(select coalesce(sum(d.amount_cents), 0)::float8 from crm_deals d where d.tenant_id = crm_accounts.tenant_id and d.account_id = crm_accounts.id and d.status = 'open' and d.deleted_at is null)`,
};

const accountSelect = {
  id: accounts.id,
  name: accounts.name,
  legalName: accounts.legalName,
  taxId: accounts.taxId,
  domain: accounts.domain,
  industry: accounts.industry,
  website: accounts.website,
  phone: accounts.phone,
  status: accounts.status,
  source: accounts.source,
  notes: accounts.notes,
  ownerMembershipId: accounts.ownerMembershipId,
  createdAt: accounts.createdAt,
  updatedAt: accounts.updatedAt,
  ...accountCounts,
};

const contactSelect = {
  id: contacts.id,
  accountId: contacts.accountId,
  accountName: accounts.name,
  firstName: contacts.firstName,
  lastName: contacts.lastName,
  email: contacts.email,
  phone: contacts.phone,
  jobTitle: contacts.jobTitle,
  status: contacts.status,
  ownerMembershipId: contacts.ownerMembershipId,
  createdAt: contacts.createdAt,
  updatedAt: contacts.updatedAt,
};

const dealSelect = {
  id: deals.id,
  name: deals.name,
  accountId: deals.accountId,
  accountName: accounts.name,
  primaryContactId: deals.primaryContactId,
  primaryContactName: sql<
    string | null
  >`case when ${contacts.id} is null then null else trim(${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, '')) end`,
  pipelineId: deals.pipelineId,
  stageId: deals.stageId,
  stageName: stages.name,
  stageKind: stages.kind,
  amountCents: deals.amountCents,
  currency: deals.currency,
  probability: deals.probability,
  expectedCloseOn: deals.expectedCloseOn,
  ownerMembershipId: deals.ownerMembershipId,
  status: deals.status,
  lostReason: deals.lostReason,
  nextActionAt: deals.nextActionAt,
  nextActionText: deals.nextActionText,
  closedAt: deals.closedAt,
  stageChangedAt: deals.stageChangedAt,
  createdAt: deals.createdAt,
  updatedAt: deals.updatedAt,
};

const dealFrom = (tx: Tx) =>
  tx
    .select(dealSelect)
    .from(deals)
    .innerJoin(
      accounts,
      and(eq(accounts.tenantId, deals.tenantId), eq(accounts.id, deals.accountId)),
    )
    .innerJoin(stages, and(eq(stages.tenantId, deals.tenantId), eq(stages.id, deals.stageId)))
    .leftJoin(
      contacts,
      and(eq(contacts.tenantId, deals.tenantId), eq(contacts.id, deals.primaryContactId)),
    );

const taskFrom = (tx: Tx) =>
  tx
    .select({
      id: tasks.id,
      title: tasks.title,
      dueAt: tasks.dueAt,
      status: tasks.status,
      priority: tasks.priority,
      assigneeMembershipId: tasks.assigneeMembershipId,
      accountId: tasks.accountId,
      accountName: accounts.name,
      contactId: tasks.contactId,
      dealId: tasks.dealId,
      dealName: deals.name,
      completedAt: tasks.completedAt,
      createdAt: tasks.createdAt,
    })
    .from(tasks)
    .leftJoin(
      accounts,
      and(eq(accounts.tenantId, tasks.tenantId), eq(accounts.id, tasks.accountId)),
    )
    .leftJoin(deals, and(eq(deals.tenantId, tasks.tenantId), eq(deals.id, tasks.dealId)));

/**
 * Repositorio del CRM. TODA consulta corre bajo `withTenant` (RLS fuerza el tenant); los filtros por
 * propietario implementan el alcance `own`. Las filas «borradas» (`deleted_at`) nunca se devuelven.
 */
export class DbCrmRepository implements CrmRepository {
  // ── Empresas ──────────────────────────────────────────────────────────────────────────────────
  async insertAccount(tx: Tx, v: Parameters<CrmRepository["insertAccount"]>[1]) {
    const [row] = await tx
      .insert(accounts)
      .values({
        tenantId: v.tenantId,
        name: v.name,
        legalName: v.legalName,
        taxId: v.taxId,
        domain: v.domain,
        industry: v.industry,
        website: v.website,
        phone: v.phone,
        status: v.status,
        source: v.source,
        notes: v.notes,
        ownerMembershipId: v.ownerMembershipId,
      })
      .returning({ id: accounts.id });
    if (!row) throw new Error("No se pudo crear la empresa");
    return row.id;
  }

  async findAccount(tx: Tx, id: string, ownerOnly?: string): Promise<AccountRow | null> {
    const [row] = await tx
      .select(accountSelect)
      .from(accounts)
      .where(
        and(
          eq(accounts.id, id),
          isNull(accounts.deletedAt),
          ownerOnly ? eq(accounts.ownerMembershipId, ownerOnly) : undefined,
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async listAccounts(tx: Tx, f: ListFilter): Promise<Paged<AccountRow>> {
    const cur = decodeCursor(f.cursor);
    const rows = await tx
      .select(accountSelect)
      .from(accounts)
      .where(
        and(
          isNull(accounts.deletedAt),
          f.ownerOnly ? eq(accounts.ownerMembershipId, f.ownerOnly) : undefined,
          f.ownerId ? eq(accounts.ownerMembershipId, f.ownerId) : undefined,
          f.status ? eq(accounts.status, f.status) : undefined,
          f.search
            ? or(
                sql`nexo_unaccent(lower(${accounts.name})) like ${likePattern(f.search)}`,
                sql`lower(coalesce(${accounts.domain}, '')) like ${likePattern(f.search)}`,
                sql`lower(coalesce(${accounts.taxId}, '')) like ${likePattern(f.search)}`,
              )
            : undefined,
          cur
            ? or(
                lt(accounts.createdAt, cur.at),
                and(eq(accounts.createdAt, cur.at), lt(accounts.id, cur.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(accounts.createdAt), desc(accounts.id))
      .limit(f.limit + 1);
    const items = rows.slice(0, f.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > f.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async updateAccount(tx: Tx, id: string, patch: Parameters<CrmRepository["updateAccount"]>[2]) {
    await tx
      .update(accounts)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(accounts.id, id), isNull(accounts.deletedAt)));
  }

  async softDeleteAccount(tx: Tx, id: string) {
    await tx
      .update(accounts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(accounts.id, id));
  }

  async countOpenDealsOfAccount(tx: Tx, accountId: string) {
    const [r] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(deals)
      .where(
        and(eq(deals.accountId, accountId), eq(deals.status, "open"), isNull(deals.deletedAt)),
      );
    return r?.n ?? 0;
  }

  // ── Contactos ─────────────────────────────────────────────────────────────────────────────────
  async insertContact(tx: Tx, v: Parameters<CrmRepository["insertContact"]>[1]) {
    const [row] = await tx
      .insert(contacts)
      .values({
        tenantId: v.tenantId,
        accountId: v.accountId,
        firstName: v.firstName,
        lastName: v.lastName,
        email: v.email,
        phone: v.phone,
        jobTitle: v.jobTitle,
        status: v.status,
        ownerMembershipId: v.ownerMembershipId,
      })
      .returning({ id: contacts.id });
    if (!row) throw new Error("No se pudo crear el contacto");
    return row.id;
  }

  private contactQuery(tx: Tx) {
    return tx
      .select(contactSelect)
      .from(contacts)
      .leftJoin(
        accounts,
        and(eq(accounts.tenantId, contacts.tenantId), eq(accounts.id, contacts.accountId)),
      );
  }

  async findContact(tx: Tx, id: string, ownerOnly?: string): Promise<ContactRow | null> {
    const [row] = await this.contactQuery(tx)
      .where(
        and(
          eq(contacts.id, id),
          isNull(contacts.deletedAt),
          ownerOnly ? eq(contacts.ownerMembershipId, ownerOnly) : undefined,
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async findContactByEmail(tx: Tx, email: string): Promise<ContactRow | null> {
    const [row] = await this.contactQuery(tx)
      .where(
        and(sql`lower(${contacts.email}) = ${email.toLowerCase()}`, isNull(contacts.deletedAt)),
      )
      .limit(1);
    return row ?? null;
  }

  async listContacts(tx: Tx, f: ListFilter): Promise<Paged<ContactRow>> {
    const cur = decodeCursor(f.cursor);
    const fullName = sql`nexo_unaccent(lower(${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, '')))`;
    const rows = await this.contactQuery(tx)
      .where(
        and(
          isNull(contacts.deletedAt),
          f.ownerOnly ? eq(contacts.ownerMembershipId, f.ownerOnly) : undefined,
          f.ownerId ? eq(contacts.ownerMembershipId, f.ownerId) : undefined,
          f.accountId ? eq(contacts.accountId, f.accountId) : undefined,
          f.status ? eq(contacts.status, f.status) : undefined,
          f.search
            ? or(
                sql`${fullName} like ${likePattern(f.search)}`,
                sql`lower(coalesce(${contacts.email}, '')) like ${likePattern(f.search)}`,
              )
            : undefined,
          cur
            ? or(
                lt(contacts.createdAt, cur.at),
                and(eq(contacts.createdAt, cur.at), lt(contacts.id, cur.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(contacts.createdAt), desc(contacts.id))
      .limit(f.limit + 1);
    const items = rows.slice(0, f.limit);
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > f.limit && last ? encodeCursor(last.createdAt, last.id) : null,
    };
  }

  async contactsOfAccount(tx: Tx, accountId: string, limit: number): Promise<ContactRow[]> {
    return this.contactQuery(tx)
      .where(and(eq(contacts.accountId, accountId), isNull(contacts.deletedAt)))
      .orderBy(asc(contacts.firstName))
      .limit(limit);
  }

  async updateContact(tx: Tx, id: string, patch: Parameters<CrmRepository["updateContact"]>[2]) {
    await tx
      .update(contacts)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(contacts.id, id), isNull(contacts.deletedAt)));
  }

  async softDeleteContact(tx: Tx, id: string) {
    await tx
      .update(contacts)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(contacts.id, id));
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────────────────────────
  private async withStages(
    tx: Tx,
    rows: Array<{ id: string; name: string; isDefault: boolean }>,
  ): Promise<PipelineRow[]> {
    if (rows.length === 0) return [];
    const stageRows = await tx
      .select({
        id: stages.id,
        pipelineId: stages.pipelineId,
        name: stages.name,
        position: stages.position,
        probability: stages.probability,
        kind: stages.kind,
        dealsCount: sql<number>`(select count(*)::int from crm_deals d where d.tenant_id = crm_pipeline_stages.tenant_id and d.stage_id = crm_pipeline_stages.id)`,
      })
      .from(stages)
      .where(
        inArray(
          stages.pipelineId,
          rows.map((r) => r.id),
        ),
      )
      .orderBy(asc(stages.position));
    return rows.map((p) => ({
      ...p,
      stages: stageRows.filter((s) => s.pipelineId === p.id) as StageRow[],
    }));
  }

  async listPipelines(tx: Tx): Promise<PipelineRow[]> {
    const rows = await tx
      .select({ id: pipelines.id, name: pipelines.name, isDefault: pipelines.isDefault })
      .from(pipelines)
      .orderBy(desc(pipelines.isDefault), asc(pipelines.position), asc(pipelines.createdAt));
    return this.withStages(tx, rows);
  }

  async findPipeline(tx: Tx, id: string): Promise<PipelineRow | null> {
    const rows = await tx
      .select({ id: pipelines.id, name: pipelines.name, isDefault: pipelines.isDefault })
      .from(pipelines)
      .where(eq(pipelines.id, id))
      .limit(1);
    return (await this.withStages(tx, rows))[0] ?? null;
  }

  async defaultPipeline(tx: Tx): Promise<PipelineRow | null> {
    const rows = await tx
      .select({ id: pipelines.id, name: pipelines.name, isDefault: pipelines.isDefault })
      .from(pipelines)
      .where(eq(pipelines.isDefault, true))
      .limit(1);
    return (await this.withStages(tx, rows))[0] ?? null;
  }

  async insertPipeline(
    tx: Tx,
    v: {
      tenantId: string;
      name: string;
      isDefault: boolean;
      position: number;
      stages: Array<StageDef & { position: number }>;
    },
  ) {
    // ON CONFLICT: dos altas simultáneas del pipeline por defecto → una gana, la otra reutiliza.
    const [row] = await tx
      .insert(pipelines)
      .values({ tenantId: v.tenantId, name: v.name, isDefault: v.isDefault, position: v.position })
      .onConflictDoNothing()
      .returning({ id: pipelines.id });
    if (!row) {
      const existing = await this.defaultPipeline(tx);
      if (!existing) throw new Error("No se pudo crear el pipeline");
      return existing.id;
    }
    await tx.insert(stages).values(
      v.stages.map((s) => ({
        tenantId: v.tenantId,
        pipelineId: row.id,
        name: s.name,
        position: s.position,
        probability: s.probability,
        kind: s.kind,
      })),
    );
    return row.id;
  }

  async renamePipeline(tx: Tx, id: string, name: string) {
    await tx.update(pipelines).set({ name, updatedAt: new Date() }).where(eq(pipelines.id, id));
  }

  async syncStages(
    tx: Tx,
    tenantId: string,
    pipelineId: string,
    defs: Array<StageDef & { position: number }>,
  ) {
    const existing = await tx
      .select({ id: stages.id })
      .from(stages)
      .where(eq(stages.pipelineId, pipelineId));
    const keep = new Set(defs.map((d) => d.id).filter((x): x is string => !!x));
    const remove = existing.filter((e) => !keep.has(e.id)).map((e) => e.id);
    if (remove.length > 0) await tx.delete(stages).where(inArray(stages.id, remove));
    for (const d of defs) {
      if (d.id) {
        await tx
          .update(stages)
          .set({
            name: d.name,
            position: d.position,
            probability: d.probability,
            kind: d.kind,
            updatedAt: new Date(),
          })
          .where(eq(stages.id, d.id));
      } else {
        await tx.insert(stages).values({
          tenantId,
          pipelineId,
          name: d.name,
          position: d.position,
          probability: d.probability,
          kind: d.kind,
        });
      }
    }
  }

  // ── Oportunidades ─────────────────────────────────────────────────────────────────────────────
  async insertDeal(tx: Tx, v: Parameters<CrmRepository["insertDeal"]>[1]) {
    const [row] = await tx.insert(deals).values(v).returning({ id: deals.id });
    if (!row) throw new Error("No se pudo crear la oportunidad");
    return row.id;
  }

  async findDeal(tx: Tx, id: string, ownerOnly?: string): Promise<DealRow | null> {
    const [row] = await dealFrom(tx)
      .where(
        and(
          eq(deals.id, id),
          isNull(deals.deletedAt),
          ownerOnly ? eq(deals.ownerMembershipId, ownerOnly) : undefined,
        ),
      )
      .limit(1);
    return (row as DealRow | undefined) ?? null;
  }

  async listDeals(tx: Tx, f: Parameters<CrmRepository["listDeals"]>[1]): Promise<DealRow[]> {
    const rows = await dealFrom(tx)
      .where(
        and(
          isNull(deals.deletedAt),
          f.ownerOnly ? eq(deals.ownerMembershipId, f.ownerOnly) : undefined,
          f.ownerId ? eq(deals.ownerMembershipId, f.ownerId) : undefined,
          f.pipelineId ? eq(deals.pipelineId, f.pipelineId) : undefined,
          f.status ? eq(deals.status, f.status) : undefined,
          f.accountId ? eq(deals.accountId, f.accountId) : undefined,
          f.search
            ? sql`nexo_unaccent(lower(${deals.name})) like ${likePattern(f.search)}`
            : undefined,
        ),
      )
      .orderBy(desc(deals.updatedAt), desc(deals.id))
      .limit(f.limit);
    return rows as DealRow[];
  }

  async updateDeal(tx: Tx, id: string, patch: Parameters<CrmRepository["updateDeal"]>[2]) {
    await tx
      .update(deals)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(deals.id, id), isNull(deals.deletedAt)));
  }

  async softDeleteDeal(tx: Tx, id: string) {
    await tx
      .update(deals)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(deals.id, id));
  }

  // ── Actividad ─────────────────────────────────────────────────────────────────────────────────
  async insertActivity(tx: Tx, v: Parameters<CrmRepository["insertActivity"]>[1]) {
    const [row] = await tx.insert(activities).values(v).returning({ id: activities.id });
    if (!row) throw new Error("No se pudo registrar la actividad");
    return row.id;
  }

  async listActivities(
    tx: Tx,
    f: Parameters<CrmRepository["listActivities"]>[1],
  ): Promise<ActivityRow[]> {
    return tx
      .select({
        id: activities.id,
        kind: activities.kind,
        subject: activities.subject,
        body: activities.body,
        occurredAt: activities.occurredAt,
        authorMembershipId: activities.authorMembershipId,
        accountId: activities.accountId,
        contactId: activities.contactId,
        dealId: activities.dealId,
        source: activities.source,
      })
      .from(activities)
      .where(
        and(
          f.accountId ? eq(activities.accountId, f.accountId) : undefined,
          f.contactId ? eq(activities.contactId, f.contactId) : undefined,
          f.dealId ? eq(activities.dealId, f.dealId) : undefined,
        ),
      )
      .orderBy(desc(activities.occurredAt), desc(activities.id))
      .limit(f.limit);
  }

  // ── Tareas ────────────────────────────────────────────────────────────────────────────────────
  async insertTask(tx: Tx, v: Parameters<CrmRepository["insertTask"]>[1]) {
    const [row] = await tx.insert(tasks).values(v).returning({ id: tasks.id });
    if (!row) throw new Error("No se pudo crear la tarea");
    return row.id;
  }

  async findTask(tx: Tx, id: string): Promise<TaskRow | null> {
    const [row] = await taskFrom(tx).where(eq(tasks.id, id)).limit(1);
    return (row as TaskRow | undefined) ?? null;
  }

  async listTasks(tx: Tx, f: Parameters<CrmRepository["listTasks"]>[1]): Promise<TaskRow[]> {
    const rows = await taskFrom(tx)
      .where(
        and(
          f.assigneeMembershipId
            ? eq(tasks.assigneeMembershipId, f.assigneeMembershipId)
            : undefined,
          f.status ? eq(tasks.status, f.status) : undefined,
          f.accountId ? eq(tasks.accountId, f.accountId) : undefined,
          f.dealId ? eq(tasks.dealId, f.dealId) : undefined,
        ),
      )
      // Vencidas y próximas primero; sin fecha al final.
      .orderBy(sql`${tasks.dueAt} asc nulls last`, desc(tasks.createdAt))
      .limit(f.limit);
    return rows as TaskRow[];
  }

  async updateTask(tx: Tx, id: string, patch: Parameters<CrmRepository["updateTask"]>[2]) {
    await tx
      .update(tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tasks.id, id));
  }

  async deleteTask(tx: Tx, id: string) {
    await tx.delete(tasks).where(eq(tasks.id, id));
  }

  // ── Búsqueda global ───────────────────────────────────────────────────────────────────────────
  async search(tx: Tx, q: string, ownerOnly: string | undefined) {
    const pattern = likePattern(q);
    const [a, c, d] = await Promise.all([
      tx
        .select({ id: accounts.id, title: accounts.name, subtitle: accounts.domain })
        .from(accounts)
        .where(
          and(
            isNull(accounts.deletedAt),
            ownerOnly ? eq(accounts.ownerMembershipId, ownerOnly) : undefined,
            sql`nexo_unaccent(lower(${accounts.name})) like ${pattern}`,
          ),
        )
        .limit(6),
      tx
        .select({
          id: contacts.id,
          title: sql<string>`trim(${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, ''))`,
          subtitle: contacts.email,
        })
        .from(contacts)
        .where(
          and(
            isNull(contacts.deletedAt),
            ownerOnly ? eq(contacts.ownerMembershipId, ownerOnly) : undefined,
            or(
              sql`nexo_unaccent(lower(${contacts.firstName} || ' ' || coalesce(${contacts.lastName}, ''))) like ${pattern}`,
              sql`lower(coalesce(${contacts.email}, '')) like ${pattern}`,
            ),
          ),
        )
        .limit(6),
      tx
        .select({ id: deals.id, title: deals.name, subtitle: accounts.name })
        .from(deals)
        .innerJoin(
          accounts,
          and(eq(accounts.tenantId, deals.tenantId), eq(accounts.id, deals.accountId)),
        )
        .where(
          and(
            isNull(deals.deletedAt),
            ownerOnly ? eq(deals.ownerMembershipId, ownerOnly) : undefined,
            sql`nexo_unaccent(lower(${deals.name})) like ${pattern}`,
          ),
        )
        .limit(6),
    ]);
    return [
      ...a.map((r) => ({ type: "account" as const, ...r })),
      ...c.map((r) => ({ type: "contact" as const, ...r })),
      ...d.map((r) => ({ type: "deal" as const, ...r })),
    ];
  }

  // ── Datos del tenant ──────────────────────────────────────────────────────────────────────────
  async tenantCurrency(tx: Tx): Promise<string> {
    // `tenants` solo expone SU fila a nexo_app (política tenant_self).
    const [row] = await tx.select({ currency: tenants.currency }).from(tenants).limit(1);
    return row?.currency ?? "EUR";
  }
}
