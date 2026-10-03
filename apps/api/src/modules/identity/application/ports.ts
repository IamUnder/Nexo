import type { PermissionScope } from "@nexo/contracts";
import type { Tx } from "../../../platform/db/database";
import type { PermissionOverride } from "../domain/permissions";

// ── Registros ───────────────────────────────────────────────────────────────────────────────
export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  locale: string;
  status: string;
  emailVerifiedAt: Date | null;
  failedLogins: number;
  lockedUntil: Date | null;
  createdAt: Date;
}

export interface MembershipRecord {
  id: string;
  tenantId: string;
  userId: string;
  role: string;
  seatType: string;
  status: string;
  title: string | null;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export interface MemberView extends MembershipRecord {
  email: string;
  fullName: string;
}

export interface InvitationRecord {
  id: string;
  tenantId: string;
  email: string;
  role: string;
  seatType: string;
  tokenHash: string;
  expiresAt: Date;
  invitedBy: string | null;
  acceptedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface RefreshRecord {
  id: string;
  familyId: string;
  tokenHash: string;
  subjectType: "user" | "superadmin";
  subjectId: string;
  membershipId: string | null;
  expiresAt: Date;
  rotatedAt: Date | null;
  revokedAt: Date | null;
}

export interface SuperadminRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  status: string;
  failedLogins: number;
  lockedUntil: Date | null;
}

export type UserTokenKind = "password_reset" | "email_verification";

// ── Repositorios (los implementa `infrastructure/repositories.ts`) ────────────────────────
export interface UserRepository {
  findByEmail(tx: Tx, email: string): Promise<UserRecord | null>;
  findById(tx: Tx, id: string): Promise<UserRecord | null>;
  insert(
    tx: Tx,
    v: {
      email: string;
      passwordHash: string;
      fullName: string;
      locale: string;
      emailVerified: boolean;
    },
  ): Promise<UserRecord>;
  updatePassword(tx: Tx, id: string, passwordHash: string): Promise<void>;
  markEmailVerified(tx: Tx, id: string, at: Date): Promise<void>;
  recordFailure(tx: Tx, id: string, failedLogins: number, lockedUntil: Date | null): Promise<void>;
  resetFailures(tx: Tx, id: string): Promise<void>;
}

export interface MembershipRepository {
  insert(
    tx: Tx,
    v: { tenantId: string; userId: string; role: string; seatType: string },
  ): Promise<MembershipRecord>;
  findById(tx: Tx, id: string): Promise<MembershipRecord | null>;
  findByUserAndTenant(tx: Tx, userId: string, tenantId: string): Promise<MembershipRecord | null>;
  /** Todas las membresías ACTIVAS de una persona (cruza tenants: solo con pool de plataforma). */
  listActiveByUser(tx: Tx, userId: string): Promise<MembershipRecord[]>;
  listForTenant(tx: Tx): Promise<MemberView[]>;
  findViewById(tx: Tx, id: string): Promise<MemberView | null>;
  update(
    tx: Tx,
    id: string,
    patch: { role?: string; seatType?: string; status?: string },
  ): Promise<MembershipRecord>;
  touch(tx: Tx, id: string, at: Date): Promise<void>;
  countActiveOwners(tx: Tx): Promise<number>;
  countActiveBySeat(tx: Tx, seatType: string): Promise<number>;
  countByTenant(tx: Tx, tenantIds: string[]): Promise<Map<string, number>>;
}

export interface InvitationRepository {
  insert(
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
  ): Promise<InvitationRecord>;
  findByTokenHash(tx: Tx, tokenHash: string): Promise<InvitationRecord | null>;
  findById(tx: Tx, id: string): Promise<InvitationRecord | null>;
  listForTenant(tx: Tx): Promise<InvitationRecord[]>;
  markAccepted(tx: Tx, id: string, at: Date): Promise<void>;
  revoke(tx: Tx, id: string, at: Date): Promise<void>;
  pendingFor(tx: Tx, email: string, now: Date): Promise<InvitationRecord | null>;
  countPendingBySeat(tx: Tx, seatType: string, now: Date): Promise<number>;
}

export interface TokenStore {
  saveRefresh(
    tx: Tx,
    v: Omit<RefreshRecord, "id" | "rotatedAt" | "revokedAt"> & {
      ip?: string | undefined;
      userAgent?: string | undefined;
    },
  ): Promise<void>;
  findRefreshByHash(tx: Tx, hash: string): Promise<RefreshRecord | null>;
  markRefreshRotated(tx: Tx, id: string, at: Date): Promise<void>;
  revokeFamily(tx: Tx, familyId: string, at: Date): Promise<void>;
  revokeAllForSubject(
    tx: Tx,
    type: "user" | "superadmin",
    subjectId: string,
    at: Date,
  ): Promise<void>;
  saveUserToken(
    tx: Tx,
    v: { userId: string; kind: UserTokenKind; tokenHash: string; expiresAt: Date },
  ): Promise<void>;
  /** Mira el dueño de un token válido SIN consumirlo (para validar antes de gastarlo). */
  peekUserToken(
    tx: Tx,
    hash: string,
    kind: UserTokenKind,
    now: Date,
  ): Promise<{ userId: string } | null>;
  /** Marca como usado y devuelve el dueño si el token es válido (existe, no usado, no caducado). */
  consumeUserToken(
    tx: Tx,
    hash: string,
    kind: UserTokenKind,
    now: Date,
  ): Promise<{ userId: string } | null>;
  invalidateUserTokens(tx: Tx, userId: string, kind: UserTokenKind, at: Date): Promise<void>;
}

export interface OverrideRepository {
  /** Ajustes de UN tenant. Filtra siempre por `tenantId` (defensa en profundidad además de RLS). */
  list(tx: Tx, tenantId: string): Promise<PermissionOverride[]>;
  /** Sustituye los ajustes de UN rol por exactamente `entries` (lista vacía = volver a los valores por defecto). */
  replaceForRole(
    tx: Tx,
    tenantId: string,
    role: string,
    entries: Array<{ permission: string; granted: boolean }>,
  ): Promise<void>;
}

export interface SuperadminRepository {
  findByEmail(tx: Tx, email: string): Promise<SuperadminRecord | null>;
  findById(tx: Tx, id: string): Promise<SuperadminRecord | null>;
  recordFailure(tx: Tx, id: string, failedLogins: number, lockedUntil: Date | null): Promise<void>;
  resetFailures(tx: Tx, id: string): Promise<void>;
  insert(
    tx: Tx,
    v: { email: string; passwordHash: string; fullName: string },
  ): Promise<SuperadminRecord>;
}

// ── Servicios técnicos ──────────────────────────────────────────────────────────────────────
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(hash: string, password: string): Promise<boolean>;
}

export interface AccessClaimsInput {
  scope: "tenant" | "platform";
  userId: string;
  tenantId?: string | undefined;
  membershipId?: string | undefined;
  role?: string | undefined;
  seat?: string | undefined;
}

export interface TokenService {
  signAccess(claims: AccessClaimsInput): Promise<string>;
  signSelection(userId: string): Promise<string>;
  verifySelection(token: string): Promise<{ userId: string }>;
  accessTtlSeconds: number;
  refreshTtlMs: number;
}

// ── Puertos hacia OTROS módulos (los cablea `composition/`) ──────────────────────────────────
export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  status: string;
}
export interface TenantDetails extends TenantInfo {
  locale: string;
  timezone: string;
  currency: string;
  trialEndsAt: string | null;
}

/** Datos de tenants que identity muestra al usuario (selector de empresa, `/session/me`). */
export interface TenantDirectory {
  summaries(tx: Tx, ids: string[]): Promise<TenantDetails[]>;
}

/** Límites de asientos contratados (hito 2: Stripe/entitlements). `null` = sin límite. */
export interface SeatPolicy {
  limitFor(tx: Tx, tenantId: string, seatType: "full" | "light"): Promise<number | null>;
}

/** Módulos activos del tenant (para `/session/me`). */
export interface ModuleCatalog {
  activeModules(tx: Tx, tenantId: string): Promise<string[]>;
}

export type { PermissionOverride, PermissionScope };
