import type { Tx } from "../../../platform/db/database";
import type { StageDef, StageKind } from "../domain/pipelines";

// ── Registros (lo que devuelve el repositorio, ya con los datos de las uniones necesarias) ──────
export interface AccountRow {
  id: string;
  name: string;
  legalName: string | null;
  taxId: string | null;
  domain: string | null;
  industry: string | null;
  website: string | null;
  phone: string | null;
  status: string;
  source: string | null;
  notes: string | null;
  ownerMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
  contactsCount: number;
  openDealsCount: number;
  openDealsAmountCents: number;
}

export interface ContactRow {
  id: string;
  accountId: string | null;
  accountName: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  jobTitle: string | null;
  status: string;
  ownerMembershipId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StageRow {
  id: string;
  pipelineId: string;
  name: string;
  position: number;
  probability: number;
  kind: StageKind;
  dealsCount: number;
}

export interface PipelineRow {
  id: string;
  name: string;
  isDefault: boolean;
  stages: StageRow[];
}

export interface DealRow {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  primaryContactId: string | null;
  primaryContactName: string | null;
  pipelineId: string;
  stageId: string;
  stageName: string;
  stageKind: StageKind;
  amountCents: number;
  currency: string;
  probability: number;
  expectedCloseOn: string | null;
  ownerMembershipId: string | null;
  status: "open" | "won" | "lost";
  lostReason: string | null;
  nextActionAt: Date | null;
  nextActionText: string | null;
  closedAt: Date | null;
  stageChangedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActivityRow {
  id: string;
  kind: string;
  subject: string;
  body: string | null;
  occurredAt: Date;
  authorMembershipId: string | null;
  accountId: string | null;
  contactId: string | null;
  dealId: string | null;
  source: string;
}

export interface TaskRow {
  id: string;
  title: string;
  dueAt: Date | null;
  status: "open" | "done";
  priority: string;
  assigneeMembershipId: string | null;
  accountId: string | null;
  accountName: string | null;
  contactId: string | null;
  dealId: string | null;
  dealName: string | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ListFilter {
  /** `own` (solo lo propio) o `all`; la fija el permiso concedido. */
  ownerOnly?: string | undefined;
  ownerId?: string | undefined;
  search?: string | undefined;
  status?: string | undefined;
  accountId?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
}

// ── Repositorio (lo implementa `infrastructure/crmRepository.ts`; todo bajo `withTenant`) ─────────
export interface CrmRepository {
  // Empresas
  insertAccount(
    tx: Tx,
    v: Omit<
      AccountRow,
      "id" | "createdAt" | "updatedAt" | "contactsCount" | "openDealsCount" | "openDealsAmountCents"
    > & { tenantId: string },
  ): Promise<string>;
  findAccount(tx: Tx, id: string, ownerOnly?: string): Promise<AccountRow | null>;
  listAccounts(tx: Tx, f: ListFilter): Promise<Paged<AccountRow>>;
  updateAccount(
    tx: Tx,
    id: string,
    patch: Partial<
      Pick<
        AccountRow,
        | "name"
        | "legalName"
        | "taxId"
        | "domain"
        | "industry"
        | "website"
        | "phone"
        | "status"
        | "source"
        | "notes"
        | "ownerMembershipId"
      >
    >,
  ): Promise<void>;
  softDeleteAccount(tx: Tx, id: string): Promise<void>;
  countOpenDealsOfAccount(tx: Tx, accountId: string): Promise<number>;

  // Contactos
  insertContact(
    tx: Tx,
    v: Omit<ContactRow, "id" | "createdAt" | "updatedAt" | "accountName"> & { tenantId: string },
  ): Promise<string>;
  findContact(tx: Tx, id: string, ownerOnly?: string): Promise<ContactRow | null>;
  findContactByEmail(tx: Tx, email: string): Promise<ContactRow | null>;
  listContacts(tx: Tx, f: ListFilter): Promise<Paged<ContactRow>>;
  contactsOfAccount(tx: Tx, accountId: string, limit: number): Promise<ContactRow[]>;
  updateContact(
    tx: Tx,
    id: string,
    patch: Partial<
      Pick<
        ContactRow,
        | "accountId"
        | "firstName"
        | "lastName"
        | "email"
        | "phone"
        | "jobTitle"
        | "status"
        | "ownerMembershipId"
      >
    >,
  ): Promise<void>;
  softDeleteContact(tx: Tx, id: string): Promise<void>;

  // Pipelines
  listPipelines(tx: Tx): Promise<PipelineRow[]>;
  findPipeline(tx: Tx, id: string): Promise<PipelineRow | null>;
  defaultPipeline(tx: Tx): Promise<PipelineRow | null>;
  insertPipeline(
    tx: Tx,
    v: {
      tenantId: string;
      name: string;
      isDefault: boolean;
      position: number;
      stages: Array<StageDef & { position: number }>;
    },
  ): Promise<string>;
  renamePipeline(tx: Tx, id: string, name: string): Promise<void>;
  /** Sincroniza las etapas: actualiza las que traen `id`, crea las nuevas y borra las ausentes. */
  syncStages(
    tx: Tx,
    tenantId: string,
    pipelineId: string,
    stages: Array<StageDef & { position: number }>,
  ): Promise<void>;

  // Oportunidades
  insertDeal(
    tx: Tx,
    v: {
      tenantId: string;
      name: string;
      accountId: string;
      primaryContactId: string | null;
      pipelineId: string;
      stageId: string;
      amountCents: number;
      currency: string;
      probability: number;
      expectedCloseOn: string | null;
      ownerMembershipId: string | null;
      nextActionAt: Date | null;
      nextActionText: string | null;
    },
  ): Promise<string>;
  findDeal(tx: Tx, id: string, ownerOnly?: string): Promise<DealRow | null>;
  listDeals(
    tx: Tx,
    f: {
      ownerOnly?: string | undefined;
      ownerId?: string | undefined;
      pipelineId?: string | undefined;
      status?: string | undefined;
      accountId?: string | undefined;
      search?: string | undefined;
      limit: number;
    },
  ): Promise<DealRow[]>;
  updateDeal(
    tx: Tx,
    id: string,
    patch: Partial<{
      name: string;
      primaryContactId: string | null;
      amountCents: number;
      expectedCloseOn: string | null;
      ownerMembershipId: string | null;
      nextActionAt: Date | null;
      nextActionText: string | null;
      stageId: string;
      probability: number;
      status: string;
      lostReason: string | null;
      closedAt: Date | null;
      stageChangedAt: Date;
    }>,
  ): Promise<void>;
  softDeleteDeal(tx: Tx, id: string): Promise<void>;

  // Actividad
  insertActivity(
    tx: Tx,
    v: {
      tenantId: string;
      kind: string;
      subject: string;
      body: string | null;
      occurredAt: Date;
      authorMembershipId: string | null;
      accountId: string | null;
      contactId: string | null;
      dealId: string | null;
      source: string;
    },
  ): Promise<string>;
  listActivities(
    tx: Tx,
    f: {
      accountId?: string | undefined;
      contactId?: string | undefined;
      dealId?: string | undefined;
      limit: number;
    },
  ): Promise<ActivityRow[]>;

  // Tareas
  insertTask(
    tx: Tx,
    v: {
      tenantId: string;
      title: string;
      dueAt: Date | null;
      priority: string;
      assigneeMembershipId: string | null;
      createdByMembershipId: string | null;
      accountId: string | null;
      contactId: string | null;
      dealId: string | null;
    },
  ): Promise<string>;
  findTask(tx: Tx, id: string): Promise<TaskRow | null>;
  listTasks(
    tx: Tx,
    f: {
      assigneeMembershipId?: string | undefined;
      status?: string | undefined;
      accountId?: string | undefined;
      dealId?: string | undefined;
      limit: number;
    },
  ): Promise<TaskRow[]>;
  updateTask(
    tx: Tx,
    id: string,
    patch: Partial<{
      title: string;
      dueAt: Date | null;
      priority: string;
      assigneeMembershipId: string | null;
      status: string;
      completedAt: Date | null;
    }>,
  ): Promise<void>;
  deleteTask(tx: Tx, id: string): Promise<void>;

  // Búsqueda
  search(
    tx: Tx,
    q: string,
    ownerOnly: string | undefined,
  ): Promise<
    Array<{
      type: "account" | "contact" | "deal";
      id: string;
      title: string;
      subtitle: string | null;
    }>
  >;

  // Datos del tenant que el CRM necesita
  tenantCurrency(tx: Tx): Promise<string>;
}

// ── Puerto hacia identity (lo cablea `composition/`) ──────────────────────────────────────────
export interface MemberDirectory {
  /** Nombres visibles de miembros (para mostrar propietarios y autores). */
  names(tx: Tx, membershipIds: string[]): Promise<Map<string, string>>;
  /** ¿Es una membresía ACTIVA de este tenant? (validar propietarios y asignados). */
  isActiveMember(tx: Tx, membershipId: string): Promise<boolean>;
}
