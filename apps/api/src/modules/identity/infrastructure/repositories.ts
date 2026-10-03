import { and, asc, count, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import type { Tx } from "../../../platform/db/database";
import type {
  InvitationRecord,
  InvitationRepository,
  MembershipRecord,
  MembershipRepository,
  MemberView,
  OverrideRepository,
  RefreshRecord,
  SuperadminRecord,
  SuperadminRepository,
  TokenStore,
  UserRecord,
  UserRepository,
  UserTokenKind,
} from "../application/ports";
import type { PermissionOverride } from "../domain/permissions";
import {
  invitations,
  memberships,
  refreshTokens,
  rolePermissionOverrides,
  superadmins,
  users,
  userTokens,
} from "./schema";

const lower = (col: Parameters<typeof sql>[0] | unknown) => sql`lower(${col})`;

// ── Usuarios (identidad global: solo con el pool de plataforma) ───────────────────────────────
export class DbUserRepository implements UserRepository {
  async findByEmail(tx: Tx, email: string): Promise<UserRecord | null> {
    const [row] = await tx
      .select()
      .from(users)
      .where(eq(lower(users.email), email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }
  async findById(tx: Tx, id: string): Promise<UserRecord | null> {
    const [row] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
    return row ?? null;
  }
  async insert(
    tx: Tx,
    v: {
      email: string;
      passwordHash: string;
      fullName: string;
      locale: string;
      emailVerified: boolean;
    },
  ) {
    const [row] = await tx
      .insert(users)
      .values({
        email: v.email.toLowerCase(),
        passwordHash: v.passwordHash,
        fullName: v.fullName,
        locale: v.locale,
        emailVerifiedAt: v.emailVerified ? new Date() : null,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear el usuario");
    return row;
  }
  async updatePassword(tx: Tx, id: string, passwordHash: string) {
    await tx
      .update(users)
      .set({ passwordHash, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(users.id, id));
  }
  async markEmailVerified(tx: Tx, id: string, at: Date) {
    await tx.update(users).set({ emailVerifiedAt: at, updatedAt: at }).where(eq(users.id, id));
  }
  async recordFailure(tx: Tx, id: string, failedLogins: number, lockedUntil: Date | null) {
    await tx.update(users).set({ failedLogins, lockedUntil }).where(eq(users.id, id));
  }
  async resetFailures(tx: Tx, id: string) {
    await tx.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, id));
  }
}

// ── Membresías ────────────────────────────────────────────────────────────────────────────────
type MRow = typeof memberships.$inferSelect;
const toMembership = (r: MRow): MembershipRecord => ({ ...r });

export class DbMembershipRepository implements MembershipRepository {
  async insert(tx: Tx, v: { tenantId: string; userId: string; role: string; seatType: string }) {
    const [row] = await tx.insert(memberships).values(v).returning();
    if (!row) throw new Error("No se pudo crear la membresía");
    return toMembership(row);
  }
  async findById(tx: Tx, id: string) {
    const [row] = await tx.select().from(memberships).where(eq(memberships.id, id)).limit(1);
    return row ? toMembership(row) : null;
  }
  async findByUserAndTenant(tx: Tx, userId: string, tenantId: string) {
    const [row] = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.tenantId, tenantId)))
      .limit(1);
    return row ? toMembership(row) : null;
  }
  async listActiveByUser(tx: Tx, userId: string) {
    const rows = await tx
      .select()
      .from(memberships)
      .where(and(eq(memberships.userId, userId), eq(memberships.status, "active")))
      .orderBy(asc(memberships.createdAt));
    return rows.map(toMembership);
  }

  /** Bajo `withTenant`: RLS limita memberships y users a este tenant; solo se leen columnas concedidas. */
  async listForTenant(tx: Tx): Promise<MemberView[]> {
    const rows = await tx
      .select({ m: memberships, email: users.email, fullName: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .orderBy(asc(memberships.createdAt));
    return rows.map((r) => ({ ...toMembership(r.m), email: r.email, fullName: r.fullName }));
  }
  async findViewById(tx: Tx, id: string): Promise<MemberView | null> {
    const [r] = await tx
      .select({ m: memberships, email: users.email, fullName: users.fullName })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.id, id))
      .limit(1);
    return r ? { ...toMembership(r.m), email: r.email, fullName: r.fullName } : null;
  }

  async update(tx: Tx, id: string, patch: { role?: string; seatType?: string; status?: string }) {
    const [row] = await tx
      .update(memberships)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(memberships.id, id))
      .returning();
    if (!row) throw new Error("Membresía no encontrada");
    return toMembership(row);
  }
  async touch(tx: Tx, id: string, at: Date) {
    await tx.update(memberships).set({ lastSeenAt: at }).where(eq(memberships.id, id));
  }
  async countActiveOwners(tx: Tx) {
    const [r] = await tx
      .select({ n: count() })
      .from(memberships)
      .where(and(eq(memberships.role, "owner"), eq(memberships.status, "active")));
    return r?.n ?? 0;
  }
  async countActiveBySeat(tx: Tx, seatType: string) {
    const [r] = await tx
      .select({ n: count() })
      .from(memberships)
      .where(and(eq(memberships.seatType, seatType), eq(memberships.status, "active")));
    return r?.n ?? 0;
  }
  async countByTenant(tx: Tx, tenantIds: string[]) {
    if (tenantIds.length === 0) return new Map<string, number>();
    const rows = await tx
      .select({ tenantId: memberships.tenantId, n: count() })
      .from(memberships)
      .where(inArray(memberships.tenantId, tenantIds))
      .groupBy(memberships.tenantId);
    return new Map(rows.map((r) => [r.tenantId, r.n]));
  }
}

// ── Invitaciones ──────────────────────────────────────────────────────────────────────────────
const toInvitation = (r: typeof invitations.$inferSelect): InvitationRecord => ({ ...r });

export class DbInvitationRepository implements InvitationRepository {
  async insert(
    tx: Tx,
    v: {
      tenantId: string;
      email: string;
      role: string;
      seatType: string;
      tokenHash: string;
      expiresAt: Date;
      invitedBy: string | null;
    },
  ) {
    const [row] = await tx
      .insert(invitations)
      .values({ ...v, email: v.email.toLowerCase() })
      .returning();
    if (!row) throw new Error("No se pudo crear la invitación");
    return toInvitation(row);
  }
  async findByTokenHash(tx: Tx, tokenHash: string) {
    const [row] = await tx
      .select()
      .from(invitations)
      .where(eq(invitations.tokenHash, tokenHash))
      .limit(1);
    return row ? toInvitation(row) : null;
  }
  async findById(tx: Tx, id: string) {
    const [row] = await tx.select().from(invitations).where(eq(invitations.id, id)).limit(1);
    return row ? toInvitation(row) : null;
  }
  async listForTenant(tx: Tx) {
    const rows = await tx.select().from(invitations).orderBy(asc(invitations.createdAt));
    return rows.map(toInvitation);
  }
  async markAccepted(tx: Tx, id: string, at: Date) {
    await tx.update(invitations).set({ acceptedAt: at }).where(eq(invitations.id, id));
  }
  async revoke(tx: Tx, id: string, at: Date) {
    await tx.update(invitations).set({ revokedAt: at }).where(eq(invitations.id, id));
  }
  async pendingFor(tx: Tx, email: string, now: Date) {
    const [row] = await tx
      .select()
      .from(invitations)
      .where(
        and(
          eq(lower(invitations.email), email.toLowerCase()),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      )
      .limit(1);
    return row ? toInvitation(row) : null;
  }
  async countPendingBySeat(tx: Tx, seatType: string, now: Date) {
    const [r] = await tx
      .select({ n: count() })
      .from(invitations)
      .where(
        and(
          eq(invitations.seatType, seatType),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      );
    return r?.n ?? 0;
  }
}

// ── Tokens (refresh y de un solo uso) ─────────────────────────────────────────────────────────
export class DbTokenStore implements TokenStore {
  async saveRefresh(
    tx: Tx,
    v: Omit<RefreshRecord, "id" | "rotatedAt" | "revokedAt"> & {
      ip?: string | undefined;
      userAgent?: string | undefined;
    },
  ) {
    await tx.insert(refreshTokens).values({
      familyId: v.familyId,
      tokenHash: v.tokenHash,
      subjectType: v.subjectType,
      subjectId: v.subjectId,
      membershipId: v.membershipId,
      expiresAt: v.expiresAt,
      ip: v.ip ?? null,
      userAgent: v.userAgent?.slice(0, 300) ?? null,
    });
  }
  async findRefreshByHash(tx: Tx, hash: string): Promise<RefreshRecord | null> {
    const [r] = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, hash))
      .limit(1);
    return r
      ? {
          id: r.id,
          familyId: r.familyId,
          tokenHash: r.tokenHash,
          subjectType: r.subjectType as "user" | "superadmin",
          subjectId: r.subjectId,
          membershipId: r.membershipId,
          expiresAt: r.expiresAt,
          rotatedAt: r.rotatedAt,
          revokedAt: r.revokedAt,
        }
      : null;
  }
  async markRefreshRotated(tx: Tx, id: string, at: Date) {
    await tx.update(refreshTokens).set({ rotatedAt: at }).where(eq(refreshTokens.id, id));
  }
  async revokeFamily(tx: Tx, familyId: string, at: Date) {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }
  async revokeAllForSubject(tx: Tx, type: "user" | "superadmin", subjectId: string, at: Date) {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: at })
      .where(
        and(
          eq(refreshTokens.subjectType, type),
          eq(refreshTokens.subjectId, subjectId),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }
  async saveUserToken(
    tx: Tx,
    v: { userId: string; kind: UserTokenKind; tokenHash: string; expiresAt: Date },
  ) {
    await tx.insert(userTokens).values(v);
  }
  async peekUserToken(tx: Tx, hash: string, kind: UserTokenKind, now: Date) {
    const [row] = await tx
      .select({ userId: userTokens.userId })
      .from(userTokens)
      .where(
        and(
          eq(userTokens.tokenHash, hash),
          eq(userTokens.kind, kind),
          isNull(userTokens.usedAt),
          gt(userTokens.expiresAt, now),
        ),
      )
      .limit(1);
    return row ?? null;
  }
  async consumeUserToken(tx: Tx, hash: string, kind: UserTokenKind, now: Date) {
    // UPDATE ... WHERE usado IS NULL: atómico, dos peticiones simultáneas no pueden consumirlo ambas.
    const [row] = await tx
      .update(userTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(userTokens.tokenHash, hash),
          eq(userTokens.kind, kind),
          isNull(userTokens.usedAt),
          gt(userTokens.expiresAt, now),
        ),
      )
      .returning({ userId: userTokens.userId });
    return row ?? null;
  }
  async invalidateUserTokens(tx: Tx, userId: string, kind: UserTokenKind, at: Date) {
    await tx
      .update(userTokens)
      .set({ usedAt: at })
      .where(
        and(eq(userTokens.userId, userId), eq(userTokens.kind, kind), isNull(userTokens.usedAt)),
      );
  }
}

// ── Ajustes de permisos por rol ───────────────────────────────────────────────────────────────
export class DbOverrideRepository implements OverrideRepository {
  async list(tx: Tx, tenantId: string): Promise<PermissionOverride[]> {
    const rows = await tx
      .select()
      .from(rolePermissionOverrides)
      .where(eq(rolePermissionOverrides.tenantId, tenantId));
    return rows.map((r) => ({ role: r.role, permission: r.permission, granted: r.granted }));
  }
  async replaceForRole(
    tx: Tx,
    tenantId: string,
    role: string,
    entries: Array<{ permission: string; granted: boolean }>,
  ) {
    await tx.delete(rolePermissionOverrides).where(eq(rolePermissionOverrides.role, role));
    if (entries.length > 0) {
      await tx
        .insert(rolePermissionOverrides)
        .values(entries.map((e) => ({ tenantId, role, ...e })));
    }
  }
}

// ── Superadmins ───────────────────────────────────────────────────────────────────────────────
export class DbSuperadminRepository implements SuperadminRepository {
  async findByEmail(tx: Tx, email: string): Promise<SuperadminRecord | null> {
    const [row] = await tx
      .select()
      .from(superadmins)
      .where(eq(lower(superadmins.email), email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }
  async findById(tx: Tx, id: string): Promise<SuperadminRecord | null> {
    const [row] = await tx.select().from(superadmins).where(eq(superadmins.id, id)).limit(1);
    return row ?? null;
  }
  async recordFailure(tx: Tx, id: string, failedLogins: number, lockedUntil: Date | null) {
    await tx.update(superadmins).set({ failedLogins, lockedUntil }).where(eq(superadmins.id, id));
  }
  async resetFailures(tx: Tx, id: string) {
    await tx
      .update(superadmins)
      .set({ failedLogins: 0, lockedUntil: null })
      .where(eq(superadmins.id, id));
  }
  async insert(tx: Tx, v: { email: string; passwordHash: string; fullName: string }) {
    const [row] = await tx
      .insert(superadmins)
      .values({ ...v, email: v.email.toLowerCase() })
      .returning();
    if (!row) throw new Error("No se pudo crear el superadmin");
    return row;
  }
}
