import {
  EVENT_TYPES,
  type InvitationDto,
  type InviteMemberInput,
  type MemberDto,
  membershipChangedV1,
  PERMISSIONS,
  type PermissionMatrix,
  ROLES,
  type Role,
  type SeatType,
  type UpdateMemberInput,
} from "@nexo/contracts";
import { generateToken, hashToken } from "../../../platform/crypto/tokens";
import type { Database, Tx } from "../../../platform/db/database";
import { withPlatform } from "../../../platform/db/platform";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  LimitExceededError,
  NotFoundError,
  ValidationError,
} from "../../../platform/errors";
import { publishEvent } from "../../../platform/events/outbox";
import { uuidv7 } from "../../../platform/ids";
import type { AuditLogger, Clock, SystemMailer } from "../../../platform/ports";
import type { TenantContext } from "../../../platform/tenant/context";
import { canInviteRole, checkMemberChange } from "../domain/members";
import {
  effectivePermissions,
  grantedByDefault,
  isEditableRole,
  isKnownPermission,
  isSeatCompatibleWithRole,
} from "../domain/permissions";
import { invitationMail } from "./emails";
import type {
  InvitationRecord,
  InvitationRepository,
  MembershipRepository,
  MemberView,
  OverrideRepository,
  SeatPolicy,
  TenantDirectory,
  UserRepository,
} from "./ports";

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface TeamDeps {
  database: Database;
  users: UserRepository;
  memberships: MembershipRepository;
  invitations: InvitationRepository;
  overrides: OverrideRepository;
  seats: SeatPolicy;
  tenants: TenantDirectory;
  audit: AuditLogger;
  mailer: SystemMailer;
  clock: Clock;
  publicUrl: string;
}

export const toMemberDto = (m: MemberView): MemberDto => ({
  id: m.id,
  userId: m.userId,
  email: m.email,
  fullName: m.fullName,
  role: m.role,
  seatType: m.seatType,
  status: m.status,
  title: m.title,
  lastSeenAt: m.lastSeenAt ? m.lastSeenAt.toISOString() : null,
  createdAt: m.createdAt.toISOString(),
});

function invitationStatus(i: InvitationRecord, now: Date): InvitationDto["status"] {
  if (i.acceptedAt) return "accepted";
  if (i.revokedAt) return "revoked";
  return i.expiresAt <= now ? "expired" : "pending";
}

const toInvitationDto = (i: InvitationRecord, now: Date): InvitationDto => ({
  id: i.id,
  email: i.email,
  role: i.role,
  seatType: i.seatType,
  expiresAt: i.expiresAt.toISOString(),
  createdAt: i.createdAt.toISOString(),
  status: invitationStatus(i, now),
});

/** Traduce el motivo de rechazo del dominio al error de aplicación con código estable. */
function memberChangeError(problem: string): AppError {
  if (problem === "last_owner")
    return new AppError("member.last_owner", 409, "Debe quedar al menos un propietario activo");
  if (problem === "seat_incompatible")
    return new AppError("member.seat_invalid", 400, "El rol exige asiento Full");
  return new ForbiddenError(`Cambio no permitido (${problem})`);
}

export class TeamService {
  constructor(private readonly d: TeamDeps) {}

  /** Rol y asiento ACTUALES del actor, leídos de la BD (no del token, que puede estar desactualizado). */
  private async actorOf(tx: Tx, ctx: TenantContext) {
    const id = ctx.actor.membershipId;
    const m = id ? await this.d.memberships.findViewById(tx, id) : null;
    if (!m) throw new ForbiddenError("Membresía no encontrada");
    return m;
  }

  async listMembers(ctx: TenantContext): Promise<MemberDto[]> {
    const rows = await this.d.database.withTenant(ctx, (tx) =>
      this.d.memberships.listForTenant(tx),
    );
    return rows.map(toMemberDto);
  }

  async listInvitations(ctx: TenantContext): Promise<InvitationDto[]> {
    const now = this.d.clock.now();
    const rows = await this.d.database.withTenant(ctx, (tx) =>
      this.d.invitations.listForTenant(tx),
    );
    return rows.map((i) => toInvitationDto(i, now));
  }

  // ── Asientos ────────────────────────────────────────────────────────────────────────────────

  /** Comprueba que hay asiento libre del tipo pedido (activos + invitaciones pendientes). */
  private async assertSeatAvailable(
    tx: Tx,
    tenantId: string,
    seat: SeatType,
    now: Date,
    excludingMembership = false,
  ) {
    const limit = await this.d.seats.limitFor(tx, tenantId, seat);
    if (limit === null) return;
    const active = await this.d.memberships.countActiveBySeat(tx, seat);
    const pending = excludingMembership
      ? 0
      : await this.d.invitations.countPendingBySeat(tx, seat, now);
    if (active + pending >= limit) throw new LimitExceededError(`seats:${seat}`, limit);
  }

  // ── Invitaciones ────────────────────────────────────────────────────────────────────────────

  async invite(ctx: TenantContext, input: InviteMemberInput): Promise<InvitationDto> {
    const now = this.d.clock.now();
    await this.assertEmailVerified(ctx);
    const prepared = await this.d.database.withTenant(ctx, async (tx) => {
      const actor = await this.actorOf(tx, ctx);
      if (!canInviteRole(actor.role as Role, input.role))
        throw new ForbiddenError("No puedes invitar con ese rol");
      if (!isSeatCompatibleWithRole(input.role, input.seatType)) {
        throw new AppError("member.seat_invalid", 400, "El rol exige asiento Full");
      }

      const members = await this.d.memberships.listForTenant(tx);
      if (members.some((m) => m.email.toLowerCase() === input.email)) {
        throw new ConflictError("Esa persona ya es miembro del equipo");
      }
      if (await this.d.invitations.pendingFor(tx, input.email, now)) {
        throw new ConflictError("Ya hay una invitación pendiente para ese email");
      }
      await this.assertSeatAvailable(tx, ctx.tenantId, input.seatType, now);

      const token = generateToken();
      const inv = await this.d.invitations.insert(tx, {
        tenantId: ctx.tenantId,
        email: input.email,
        role: input.role,
        seatType: input.seatType,
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        invitedBy: ctx.actor.membershipId,
      });
      await this.d.audit.record(tx, ctx, {
        action: "identity.invitation_created",
        entityType: "invitation",
        entityId: inv.id,
        after: { email: input.email, role: input.role, seatType: input.seatType },
      });
      return { inv, token, inviterName: actor.fullName };
    });

    // Fuera de la transacción: el correo solo sale si la invitación quedó confirmada.
    const tenantName = await withPlatform(
      this.d.database,
      "datos del tenant para el email",
      async (tx) => {
        const [t] = await this.d.tenants.summaries(tx, [ctx.tenantId]);
        return t?.name ?? "Nexo";
      },
    );
    await this.d.mailer.send(
      invitationMail({
        to: input.email,
        baseUrl: this.d.publicUrl,
        token: prepared.token,
        tenantName,
        inviterName: prepared.inviterName,
      }),
    );
    return toInvitationDto(prepared.inv, now);
  }

  /**
   * Las acciones con efecto externo (invitar, importar, conectar buzón) exigen email verificado
   * (ARCHITECTURE §8.2): evita que altas falsas usen la plataforma para enviar correo a terceros.
   */
  private async assertEmailVerified(ctx: TenantContext): Promise<void> {
    const membershipId = ctx.actor.membershipId;
    const verified = await withPlatform(
      this.d.database,
      "comprobar email verificado",
      async (tx) => {
        const m = membershipId ? await this.d.memberships.findById(tx, membershipId) : null;
        const user = m ? await this.d.users.findById(tx, m.userId) : null;
        return user?.emailVerifiedAt != null;
      },
    );
    if (!verified)
      throw new AppError(
        "email.unverified",
        403,
        "Confirma tu email para invitar a otras personas",
      );
  }

  async revokeInvitation(ctx: TenantContext, id: string): Promise<void> {
    const now = this.d.clock.now();
    await this.d.database.withTenant(ctx, async (tx) => {
      const inv = await this.d.invitations.findById(tx, id);
      if (!inv) throw new NotFoundError("invitación");
      if (inv.acceptedAt || inv.revokedAt)
        throw new ConflictError("La invitación ya no está pendiente");
      await this.d.invitations.revoke(tx, id, now);
      await this.d.audit.record(tx, ctx, {
        action: "identity.invitation_revoked",
        entityType: "invitation",
        entityId: id,
        before: { email: inv.email },
      });
    });
  }

  // ── Miembros ────────────────────────────────────────────────────────────────────────────────

  async updateMember(
    ctx: TenantContext,
    targetId: string,
    input: UpdateMemberInput,
  ): Promise<MemberDto> {
    const now = this.d.clock.now();
    const updated = await this.d.database.withTenant(ctx, async (tx) => {
      const actor = await this.actorOf(tx, ctx);
      const target = await this.d.memberships.findViewById(tx, targetId);
      if (!target) throw new NotFoundError("miembro");

      const problem = checkMemberChange({
        actorRole: actor.role as Role,
        actorIsTarget: actor.id === target.id,
        targetRole: target.role as Role,
        activeOwners: await this.d.memberships.countActiveOwners(tx),
        change: { role: input.role, status: input.status },
      });
      if (problem) throw memberChangeError(problem);

      const nextRole = (input.role ?? target.role) as Role;
      const nextSeat = (input.seatType ?? target.seatType) as SeatType;
      if (!isSeatCompatibleWithRole(nextRole, nextSeat))
        throw memberChangeError("seat_incompatible");

      // Cambiar a otro tipo de asiento, o reactivar a un suspendido, consume un asiento de ese tipo.
      const needsSeat =
        (input.seatType !== undefined &&
          input.seatType !== target.seatType &&
          target.status === "active") ||
        (input.status === "active" && target.status !== "active");
      if (needsSeat) await this.assertSeatAvailable(tx, ctx.tenantId, nextSeat, now, true);

      const patch: { role?: string; seatType?: string; status?: string } = {};
      if (input.role !== undefined) patch.role = input.role;
      if (input.seatType !== undefined) patch.seatType = input.seatType;
      if (input.status !== undefined) patch.status = input.status;
      const after = await this.d.memberships.update(tx, targetId, patch);

      await this.d.audit.record(tx, ctx, {
        action: "identity.member_updated",
        entityType: "membership",
        entityId: targetId,
        before: { role: target.role, seatType: target.seatType, status: target.status },
        after: { role: after.role, seatType: after.seatType, status: after.status },
      });
      await publishEvent(tx, {
        id: uuidv7(),
        ...EVENT_TYPES.membershipUpdated,
        tenantId: ctx.tenantId,
        occurredAt: now.toISOString(),
        actor: ctx.actor,
        entity: { type: "membership", id: targetId },
        payload: membershipChangedV1.parse({
          membershipId: after.id,
          userId: after.userId,
          role: after.role,
          seatType: after.seatType,
          status: after.status,
        }),
      });
      return { ...target, ...after };
    });
    return toMemberDto(updated);
  }

  // ── Matriz de permisos por rol ──────────────────────────────────────────────────────────────

  async getPermissionMatrix(ctx: TenantContext): Promise<PermissionMatrix> {
    const overrides = await this.d.database.withTenant(ctx, (tx) =>
      this.d.overrides.list(tx, ctx.tenantId),
    );
    return {
      roles: ROLES.map((role) => ({
        role,
        editable: isEditableRole(role),
        permissions: PERMISSIONS.map((permission) => {
          const o = overrides.find((x) => x.role === role && x.permission === permission);
          return {
            permission,
            granted: role === "owner" ? true : (o?.granted ?? grantedByDefault(role, permission)),
            source: o ? ("override" as const) : ("default" as const),
          };
        }),
      })),
    };
  }

  /** Fija los permisos de un rol: solo se guardan como ajuste los que difieren del valor por defecto. */
  async setRolePermissions(
    ctx: TenantContext,
    role: string,
    desired: Record<string, boolean>,
  ): Promise<PermissionMatrix> {
    if (!(ROLES as readonly string[]).includes(role)) throw new ValidationError("rol desconocido");
    if (!isEditableRole(role))
      throw new ForbiddenError("Los permisos del propietario no se pueden modificar");
    const r = role as Role;

    const entries: Array<{ permission: string; granted: boolean }> = [];
    for (const [permission, granted] of Object.entries(desired)) {
      if (!isKnownPermission(permission))
        throw new ValidationError(`permiso desconocido: ${permission}`);
      if (granted !== grantedByDefault(r, permission)) entries.push({ permission, granted });
    }

    await this.d.database.withTenant(ctx, async (tx) => {
      const actor = await this.actorOf(tx, ctx);
      // Nadie puede concederse permisos que no tiene (escalada): el admin no toca el rol de un owner (ya excluido)
      // y no puede dar a un rol más de lo que él mismo puede hacer.
      const mine = new Set(
        effectivePermissions(
          actor.role as Role,
          actor.seatType as SeatType,
          await this.d.overrides.list(tx, ctx.tenantId),
        ),
      );
      for (const e of entries) {
        if (e.granted && !mine.has(e.permission as never))
          throw new ForbiddenError("No puedes conceder un permiso que no tienes");
      }
      const before = (await this.d.overrides.list(tx, ctx.tenantId)).filter((o) => o.role === role);
      await this.d.overrides.replaceForRole(tx, ctx.tenantId, role, entries);
      await this.d.audit.record(tx, ctx, {
        action: "identity.role_permissions_updated",
        entityType: "role",
        before: {
          role,
          overrides: before.map((o) => ({ permission: o.permission, granted: o.granted })),
        },
        after: { role, overrides: entries },
      });
    });
    return this.getPermissionMatrix(ctx);
  }

  /** Recuento de miembros por tenant (puerto `MemberStats` de tenancy). */
  countByTenant(tx: Tx, tenantIds: string[]) {
    return this.d.memberships.countByTenant(tx, tenantIds);
  }
}
