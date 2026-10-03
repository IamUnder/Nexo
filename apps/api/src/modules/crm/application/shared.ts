import type {
  AccountDto,
  ActivityDto,
  ContactDto,
  DealDto,
  EVENT_TYPES,
  PipelineDto,
  TaskDto,
} from "@nexo/contracts";
import type { Database, Tx } from "../../../platform/db/database";
import { AppError, ForbiddenError, NotFoundError } from "../../../platform/errors";
import { publishEvent } from "../../../platform/events/outbox";
import { uuidv7 } from "../../../platform/ids";
import type { AuditLogger, Clock } from "../../../platform/ports";
import type { TenantContext } from "../../../platform/tenant/context";
import type { DealProblem } from "../domain/deals";
import type {
  AccountRow,
  ActivityRow,
  ContactRow,
  CrmRepository,
  DealRow,
  MemberDirectory,
  PipelineRow,
  TaskRow,
} from "./ports";

export interface CrmDeps {
  database: Database;
  repo: CrmRepository;
  members: MemberDirectory;
  audit: AuditLogger;
  clock: Clock;
}

/** Alcance de datos concedido por el permiso: `own` solo ve lo propio; `all`, todo. */
export interface Access {
  scope: "own" | "all";
  /** ¿Puede además gestionar (p. ej. editar el importe de una oportunidad ganada)? */
  canManage?: boolean;
}

export const ownerOnly = (ctx: TenantContext, access: Access): string | undefined =>
  access.scope === "own"
    ? (ctx.actor.membershipId ?? "00000000-0000-0000-0000-000000000000")
    : undefined;

/**
 * Siguiente acción obligatoria en oportunidades abiertas (PDF §04 «propietario y siguiente acción
 * obligatorios»). Hoy es una constante del módulo; pasará a ajuste por tenant con la pantalla de ajustes del CRM.
 */
export const REQUIRE_NEXT_ACTION = true;

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// ── Mapeo a DTOs (con nombres de miembros resueltos por el puerto MemberDirectory) ──────────────
export async function nameMap(deps: CrmDeps, tx: Tx, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((x): x is string => !!x))];
  return unique.length > 0 ? deps.members.names(tx, unique) : new Map<string, string>();
}

export function toAccountDto(a: AccountRow, names: Map<string, string>): AccountDto {
  return {
    id: a.id,
    name: a.name,
    legalName: a.legalName,
    taxId: a.taxId,
    domain: a.domain,
    industry: a.industry,
    website: a.website,
    phone: a.phone,
    status: a.status,
    source: a.source,
    notes: a.notes,
    ownerId: a.ownerMembershipId,
    ownerName: a.ownerMembershipId ? (names.get(a.ownerMembershipId) ?? null) : null,
    contactsCount: a.contactsCount,
    openDealsCount: a.openDealsCount,
    openDealsAmountCents: Math.round(a.openDealsAmountCents),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export function toContactDto(c: ContactRow, names: Map<string, string>): ContactDto {
  return {
    id: c.id,
    accountId: c.accountId,
    accountName: c.accountName,
    firstName: c.firstName,
    lastName: c.lastName,
    fullName: `${c.firstName} ${c.lastName ?? ""}`.trim(),
    email: c.email,
    phone: c.phone,
    jobTitle: c.jobTitle,
    status: c.status,
    ownerId: c.ownerMembershipId,
    ownerName: c.ownerMembershipId ? (names.get(c.ownerMembershipId) ?? null) : null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

export function toDealDto(d: DealRow, names: Map<string, string>): DealDto {
  return {
    id: d.id,
    name: d.name,
    accountId: d.accountId,
    accountName: d.accountName,
    primaryContactId: d.primaryContactId,
    primaryContactName: d.primaryContactName,
    pipelineId: d.pipelineId,
    stageId: d.stageId,
    stageName: d.stageName,
    stageKind: d.stageKind,
    amountCents: Number(d.amountCents),
    currency: d.currency,
    probability: d.probability,
    expectedCloseOn: d.expectedCloseOn,
    ownerId: d.ownerMembershipId,
    ownerName: d.ownerMembershipId ? (names.get(d.ownerMembershipId) ?? null) : null,
    status: d.status,
    lostReason: d.lostReason,
    nextActionAt: iso(d.nextActionAt),
    nextActionText: d.nextActionText,
    closedAt: iso(d.closedAt),
    stageChangedAt: d.stageChangedAt.toISOString(),
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

export function toPipelineDto(p: PipelineRow): PipelineDto {
  return {
    id: p.id,
    name: p.name,
    isDefault: p.isDefault,
    stages: p.stages.map((s) => ({
      id: s.id,
      name: s.name,
      position: s.position,
      probability: s.probability,
      kind: s.kind,
      dealsCount: s.dealsCount,
    })),
  };
}

export function toActivityDto(a: ActivityRow, names: Map<string, string>): ActivityDto {
  return {
    id: a.id,
    kind: a.kind,
    subject: a.subject,
    body: a.body,
    occurredAt: a.occurredAt.toISOString(),
    authorId: a.authorMembershipId,
    authorName: a.authorMembershipId ? (names.get(a.authorMembershipId) ?? null) : null,
    accountId: a.accountId,
    contactId: a.contactId,
    dealId: a.dealId,
    source: a.source,
  };
}

export function toTaskDto(t: TaskRow, names: Map<string, string>): TaskDto {
  return {
    id: t.id,
    title: t.title,
    dueAt: iso(t.dueAt),
    status: t.status,
    priority: t.priority,
    assigneeId: t.assigneeMembershipId,
    assigneeName: t.assigneeMembershipId ? (names.get(t.assigneeMembershipId) ?? null) : null,
    accountId: t.accountId,
    accountName: t.accountName,
    contactId: t.contactId,
    dealId: t.dealId,
    dealName: t.dealName,
    completedAt: iso(t.completedAt),
    createdAt: t.createdAt.toISOString(),
  };
}

// ── Eventos ─────────────────────────────────────────────────────────────────────────────────────
type EventKey = keyof typeof EVENT_TYPES;

export async function emit(
  deps: CrmDeps,
  tx: Tx,
  ctx: TenantContext,
  event: (typeof EVENT_TYPES)[EventKey],
  entity: { type: string; id: string },
  payload: unknown,
): Promise<void> {
  await publishEvent(tx, {
    id: uuidv7(),
    type: event.type,
    version: event.version,
    tenantId: ctx.tenantId,
    occurredAt: deps.clock.now().toISOString(),
    actor: ctx.actor,
    entity,
    payload,
  });
}

// ── Validaciones comunes ────────────────────────────────────────────────────────────────────────
/**
 * Resuelve el propietario de un registro: por defecto el propio actor. Debe ser un miembro ACTIVO del
 * tenant; y con alcance `own` solo se puede asignar a uno mismo (no «regalar» registros que luego no verías).
 */
export async function resolveOwner(
  deps: CrmDeps,
  tx: Tx,
  ctx: TenantContext,
  access: Access,
  requested: string | undefined,
): Promise<string | null> {
  const self = ctx.actor.membershipId;
  const owner = requested ?? self;
  if (!owner) return null;
  if (access.scope === "own" && owner !== self) {
    throw new ForbiddenError("Con tu alcance solo puedes asignarte registros a ti");
  }
  if (!(await deps.members.isActiveMember(tx, owner))) {
    throw new AppError("crm.invalid_owner", 400, "El propietario no es un miembro activo");
  }
  return owner;
}

export const notFound = (what: string) => new NotFoundError(what);

/** Problemas de dominio de oportunidades → error de aplicación con código estable. */
export function dealProblemError(problem: DealProblem): AppError {
  switch (problem) {
    case "lost_reason_required":
      return new AppError("deal.lost_reason_required", 400, "Falta el motivo de pérdida");
    case "next_action_required":
      return new AppError("deal.next_action_required", 400, "Falta la siguiente acción");
    case "closed_amount_locked":
      return new AppError(
        "deal.closed_amount_locked",
        403,
        "El importe de una oportunidad ganada está bloqueado",
      );
    case "already_closed":
      return new AppError("deal.already_closed", 409, "La oportunidad ya está cerrada");
    case "not_closed":
      return new AppError("deal.not_closed", 409, "La oportunidad no está cerrada");
    default:
      return new AppError("validation.failed", 400, `Oportunidad no válida (${problem})`);
  }
}
