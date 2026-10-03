import { randomUUID } from "node:crypto";
import type {
  AcceptInvitationResponse,
  LoginResponse,
  MeResponse,
  Role,
  SeatType,
  SessionResponse,
} from "@nexo/contracts";
import { EVENT_TYPES, membershipChangedV1 } from "@nexo/contracts";
import { generateToken, hashToken } from "../../../platform/crypto/tokens";
import type { Database, Tx } from "../../../platform/db/database";
import { withPlatform } from "../../../platform/db/platform";
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnauthenticatedError,
} from "../../../platform/errors";
import { publishEvent } from "../../../platform/events/outbox";
import { uuidv7 } from "../../../platform/ids";
import type { AccessClaims, AuditLogger, Clock, SystemMailer } from "../../../platform/ports";
import { isLocked, isWithinReuseLeeway, lockUntilAfterFailure } from "../domain/lockout";
import { checkPassword } from "../domain/password";
import { effectivePermissions } from "../domain/permissions";
import { passwordResetMail, verifyEmailMail } from "./emails";
import type {
  InvitationRepository,
  MembershipRecord,
  MembershipRepository,
  ModuleCatalog,
  OverrideRepository,
  PasswordHasher,
  SeatPolicy,
  TenantDirectory,
  TokenService,
  TokenStore,
  UserRecord,
  UserRepository,
} from "./ports";

export interface IdentityDeps {
  database: Database;
  users: UserRepository;
  memberships: MembershipRepository;
  invitations: InvitationRepository;
  tokens: TokenStore;
  overrides: OverrideRepository;
  hasher: PasswordHasher;
  jwt: TokenService;
  tenants: TenantDirectory;
  seats: SeatPolicy;
  modules: ModuleCatalog;
  audit: AuditLogger;
  mailer: SystemMailer;
  clock: Clock;
  /** URL pública de la SPA (base de los enlaces de los correos). */
  publicUrl: string;
}

export interface RequestMeta {
  ip?: string | undefined;
  userAgent?: string | undefined;
}

export interface IssuedSession {
  body: SessionResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const VERIFICATION_TTL_MS = 48 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export class InvalidCredentialsError extends AppError {
  constructor() {
    super("auth.invalid_credentials", 401, "Credenciales no válidas");
  }
}
export class AccountLockedError extends AppError {
  constructor() {
    super("auth.account_locked", 423, "Cuenta bloqueada temporalmente");
  }
}
export class TokenInvalidError extends AppError {
  constructor() {
    super("auth.token_invalid", 400, "Token no válido o caducado");
  }
}
export class WeakPasswordError extends AppError {
  constructor(problem: string) {
    super("password.weak", 400, `Contraseña débil: ${problem}`, { problem });
  }
}

type LoginOutcome =
  | { kind: "session"; session: IssuedSession }
  | { kind: "selection"; response: LoginResponse }
  | { kind: "fail"; error: AppError };

export class AuthService {
  private dummyHash: Promise<string> | undefined;

  constructor(private readonly d: IdentityDeps) {}

  /** Hash falso para igualar el tiempo de respuesta cuando el email no existe (evita enumeración por tiempo). */
  private fakeHash(): Promise<string> {
    this.dummyHash ??= this.d.hasher.hash(randomUUID());
    return this.dummyHash;
  }

  // ── Sesión ──────────────────────────────────────────────────────────────────────────────────

  /** Emite access token + refresh token para una membresía (dentro de una transacción de plataforma). */
  async issueSession(
    tx: Tx,
    user: UserRecord,
    membership: MembershipRecord,
    meta: RequestMeta,
    familyId: string = randomUUID(),
  ): Promise<IssuedSession> {
    const now = this.d.clock.now();
    const [tenant] = await this.d.tenants.summaries(tx, [membership.tenantId]);
    if (!tenant) throw new NotFoundError("tenant");

    const refreshToken = generateToken();
    const refreshExpiresAt = new Date(now.getTime() + this.d.jwt.refreshTtlMs);
    await this.d.tokens.saveRefresh(tx, {
      familyId,
      tokenHash: hashToken(refreshToken),
      subjectType: "user",
      subjectId: user.id,
      membershipId: membership.id,
      expiresAt: refreshExpiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    await this.d.memberships.touch(tx, membership.id, now);

    const accessToken = await this.d.jwt.signAccess({
      scope: "tenant",
      userId: user.id,
      tenantId: membership.tenantId,
      membershipId: membership.id,
      role: membership.role,
      seat: membership.seatType,
    });
    return {
      body: {
        kind: "session",
        accessToken,
        expiresIn: this.d.jwt.accessTtlSeconds,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          locale: user.locale,
          emailVerified: user.emailVerifiedAt !== null,
        },
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status },
        membership: { id: membership.id, role: membership.role, seatType: membership.seatType },
      },
      refreshToken,
      refreshExpiresAt,
    };
  }

  /** Emite sesión para una membresía conocida (tras un alta o al aceptar una invitación). */
  async issueForMembership(
    args: { userId: string; membershipId: string } & RequestMeta,
  ): Promise<IssuedSession> {
    return withPlatform(this.d.database, "emisión de sesión", async (tx) => {
      const user = await this.d.users.findById(tx, args.userId);
      const membership = await this.d.memberships.findById(tx, args.membershipId);
      if (!user || !membership) throw new NotFoundError("membresía");
      return this.issueSession(tx, user, membership, { ip: args.ip, userAgent: args.userAgent });
    });
  }

  // ── Login ───────────────────────────────────────────────────────────────────────────────────

  async login(
    input: { email: string; password: string },
    meta: RequestMeta,
  ): Promise<
    { kind: "session"; session: IssuedSession } | { kind: "selection"; response: LoginResponse }
  > {
    const outcome = await withPlatform<LoginOutcome>(
      this.d.database,
      "login (transversal a tenants)",
      async (tx) => {
        const now = this.d.clock.now();
        const user = await this.d.users.findByEmail(tx, input.email);
        if (!user) {
          await this.d.hasher.verify(await this.fakeHash(), input.password);
          return { kind: "fail", error: new InvalidCredentialsError() };
        }

        const valid = await this.d.hasher.verify(user.passwordHash, input.password);
        if (!valid) {
          // Contador y bloqueo progresivo; este bookkeeping se CONFIRMA aunque el login falle.
          const failures = user.failedLogins + 1;
          await this.d.users.recordFailure(
            tx,
            user.id,
            failures,
            lockUntilAfterFailure(failures, now),
          );
          await this.d.audit.recordPlatform(
            tx,
            { superadminId: null, ip: meta.ip },
            {
              action: "identity.login_failed",
              entityType: "user",
              entityId: user.id,
              metadata: { failures },
            },
          );
          return { kind: "fail", error: new InvalidCredentialsError() };
        }
        if (user.status !== "active") return { kind: "fail", error: new InvalidCredentialsError() };
        if (isLocked(user.lockedUntil, now))
          return { kind: "fail", error: new AccountLockedError() };

        await this.d.users.resetFailures(tx, user.id);
        const memberships = await this.d.memberships.listActiveByUser(tx, user.id);
        if (memberships.length === 0) {
          return {
            kind: "fail",
            error: new ForbiddenError("La cuenta no pertenece a ninguna empresa activa"),
          };
        }
        const [only] = memberships;
        if (memberships.length === 1 && only) {
          return { kind: "session", session: await this.issueSession(tx, user, only, meta) };
        }

        const tenants = await this.d.tenants.summaries(
          tx,
          memberships.map((m) => m.tenantId),
        );
        return {
          kind: "selection",
          response: {
            kind: "selection",
            selectionToken: await this.d.jwt.signSelection(user.id),
            tenants: tenants.map((t) => ({
              id: t.id,
              name: t.name,
              slug: t.slug,
              status: t.status,
            })),
          },
        };
      },
    );

    if (outcome.kind === "fail") throw outcome.error;
    return outcome;
  }

  async selectTenant(
    input: { selectionToken: string; tenantId: string },
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const { userId } = await this.d.jwt.verifySelection(input.selectionToken);
    return withPlatform(this.d.database, "selección de empresa", async (tx) => {
      const user = await this.d.users.findById(tx, userId);
      const membership = await this.d.memberships.findByUserAndTenant(tx, userId, input.tenantId);
      // Misma respuesta si no es miembro o la membresía no está activa: no se revela nada.
      if (!user || user.status !== "active" || !membership || membership.status !== "active") {
        throw new ForbiddenError("Sin acceso a esa empresa");
      }
      return this.issueSession(tx, user, membership, meta);
    });
  }

  // ── Refresh / logout ────────────────────────────────────────────────────────────────────────

  /**
   * Renueva la sesión ROTANDO el refresh token. Si llega un token ya rotado (alguien lo reutiliza)
   * se revoca TODA la familia: el robo de un token se detecta y expulsa a ambos (ARCHITECTURE §7.3).
   */
  async refresh(token: string, meta: RequestMeta): Promise<IssuedSession> {
    type Outcome = { kind: "ok"; session: IssuedSession } | { kind: "fail" };
    const outcome = await withPlatform<Outcome>(
      this.d.database,
      "refresh de sesión",
      async (tx) => {
        const now = this.d.clock.now();
        const rec = await this.d.tokens.findRefreshByHash(tx, hashToken(token));
        if (!rec || rec.subjectType !== "user" || !rec.membershipId) return { kind: "fail" };

        // Reutilización de un token ya rotado: robo (revoca la familia) salvo que sea una carrera de
        // pocos segundos (p. ej. recarga de página durante el refresh), que se tolera.
        if (rec.rotatedAt && !isWithinReuseLeeway(rec.rotatedAt, now)) {
          await this.d.tokens.revokeFamily(tx, rec.familyId, now);
          await this.d.audit.recordPlatform(
            tx,
            { superadminId: null, ip: meta.ip },
            {
              action: "identity.refresh_reuse_detected",
              entityType: "user",
              entityId: rec.subjectId,
            },
          );
          return { kind: "fail" };
        }
        if (rec.revokedAt || rec.expiresAt <= now) return { kind: "fail" };

        const user = await this.d.users.findById(tx, rec.subjectId);
        const membership = await this.d.memberships.findById(tx, rec.membershipId);
        if (!user || user.status !== "active" || !membership || membership.status !== "active") {
          await this.d.tokens.revokeFamily(tx, rec.familyId, now);
          return { kind: "fail" };
        }

        if (!rec.rotatedAt) await this.d.tokens.markRefreshRotated(tx, rec.id, now);
        return {
          kind: "ok",
          session: await this.issueSession(tx, user, membership, meta, rec.familyId),
        };
      },
    );
    if (outcome.kind === "fail") throw new UnauthenticatedError("Sesión no válida");
    return outcome.session;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await withPlatform(this.d.database, "cierre de sesión", async (tx) => {
      const rec = await this.d.tokens.findRefreshByHash(tx, hashToken(token));
      if (rec) await this.d.tokens.revokeFamily(tx, rec.familyId, this.d.clock.now());
    });
  }

  // ── Perfil ──────────────────────────────────────────────────────────────────────────────────

  async me(claims: AccessClaims): Promise<MeResponse> {
    const { tenantId, membershipId } = claims;
    if (!tenantId || !membershipId) throw new UnauthenticatedError("Token sin tenant");

    // Membresía y ajustes de permisos: con RLS (tenant del TOKEN).
    const { membership, overrides } = await this.d.database.withTenant(
      { tenantId },
      async (tx) => ({
        membership: await this.d.memberships.findById(tx, membershipId),
        overrides: await this.d.overrides.list(tx, tenantId),
      }),
    );
    if (!membership || membership.status !== "active")
      throw new UnauthenticatedError("Sesión no válida");

    // Persona y datos del tenant: identidad global → pool de plataforma.
    return withPlatform(this.d.database, "perfil de sesión", async (tx) => {
      const user = await this.d.users.findById(tx, claims.userId);
      const [tenant] = await this.d.tenants.summaries(tx, [tenantId]);
      if (!user) throw new UnauthenticatedError("Sesión no válida");
      if (!tenant) throw new NotFoundError("tenant");
      return {
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          locale: user.locale,
          emailVerified: user.emailVerifiedAt !== null,
        },
        tenant: {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
          locale: tenant.locale,
          timezone: tenant.timezone,
          currency: tenant.currency,
          trialEndsAt: tenant.trialEndsAt,
        },
        membership: { id: membership.id, role: membership.role, seatType: membership.seatType },
        permissions: effectivePermissions(
          membership.role as Role,
          membership.seatType as SeatType,
          overrides,
        ),
        modules: await this.d.modules.activeModules(tx, tenantId),
      };
    });
  }

  // ── Contraseña y email ──────────────────────────────────────────────────────────────────────

  async changePassword(
    claims: AccessClaims,
    input: { currentPassword: string; newPassword: string },
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    const { membershipId } = claims;
    if (!membershipId) throw new UnauthenticatedError("Token sin tenant");
    type Outcome = { kind: "ok"; session: IssuedSession } | { kind: "bad" };
    const outcome = await withPlatform<Outcome>(
      this.d.database,
      "cambio de contraseña",
      async (tx) => {
        const user = await this.d.users.findById(tx, claims.userId);
        const membership = await this.d.memberships.findById(tx, membershipId);
        if (!user || !membership) throw new UnauthenticatedError("Sesión no válida");
        if (!(await this.d.hasher.verify(user.passwordHash, input.currentPassword)))
          return { kind: "bad" };

        this.assertPasswordPolicy(input.newPassword, user);
        await this.d.users.updatePassword(tx, user.id, await this.d.hasher.hash(input.newPassword));
        // Cierra TODAS las sesiones y abre una nueva solo para este dispositivo.
        await this.d.tokens.revokeAllForSubject(tx, "user", user.id, this.d.clock.now());
        await this.d.audit.record(
          tx,
          { tenantId: membership.tenantId, actor: { membershipId, source: "user" } },
          {
            action: "identity.password_changed",
            entityType: "user",
            entityId: user.id,
          },
        );
        return { kind: "ok", session: await this.issueSession(tx, user, membership, meta) };
      },
    );
    if (outcome.kind === "bad") throw new InvalidCredentialsError();
    return outcome.session;
  }

  /** Siempre «éxito» hacia fuera: no revela si el email existe. El correo solo sale si hay cuenta. */
  async forgotPassword(email: string): Promise<void> {
    const mail = await withPlatform(this.d.database, "recuperación de contraseña", async (tx) => {
      const user = await this.d.users.findByEmail(tx, email);
      if (!user || user.status !== "active") return null;
      const now = this.d.clock.now();
      await this.d.tokens.invalidateUserTokens(tx, user.id, "password_reset", now);
      const token = generateToken();
      await this.d.tokens.saveUserToken(tx, {
        userId: user.id,
        kind: "password_reset",
        tokenHash: hashToken(token),
        expiresAt: new Date(now.getTime() + RESET_TTL_MS),
      });
      return passwordResetMail(user.email, this.d.publicUrl, token);
    });
    if (mail) await this.d.mailer.send(mail);
  }

  async resetPassword(input: { token: string; password: string }): Promise<void> {
    type Outcome = { ok: true } | { ok: false; error: AppError };
    const outcome = await withPlatform<Outcome>(
      this.d.database,
      "restablecer contraseña",
      async (tx) => {
        const now = this.d.clock.now();
        const hash = hashToken(input.token);
        // 1) Mirar sin gastar: una contraseña débil no debe consumir el enlace.
        const peek = await this.d.tokens.peekUserToken(tx, hash, "password_reset", now);
        const user = peek ? await this.d.users.findById(tx, peek.userId) : null;
        if (!user) return { ok: false, error: new TokenInvalidError() };
        const problem = checkPassword(input.password, {
          email: user.email,
          fullName: user.fullName,
        });
        if (problem) return { ok: false, error: new WeakPasswordError(problem) };

        // 2) Consumir de forma atómica: dos peticiones simultáneas no pueden usarlo ambas.
        const consumed = await this.d.tokens.consumeUserToken(tx, hash, "password_reset", now);
        if (!consumed) return { ok: false, error: new TokenInvalidError() };

        await this.d.users.updatePassword(tx, user.id, await this.d.hasher.hash(input.password));
        // Recibir el enlace demuestra control del email.
        if (!user.emailVerifiedAt) await this.d.users.markEmailVerified(tx, user.id, now);
        await this.d.tokens.revokeAllForSubject(tx, "user", user.id, now);
        await this.d.audit.recordPlatform(
          tx,
          { superadminId: null },
          {
            action: "identity.password_reset",
            entityType: "user",
            entityId: user.id,
          },
        );
        return { ok: true };
      },
    );
    if (!outcome.ok) throw outcome.error;
  }

  async verifyEmail(token: string): Promise<void> {
    const ok = await withPlatform(this.d.database, "verificación de email", async (tx) => {
      const now = this.d.clock.now();
      const owner = await this.d.tokens.consumeUserToken(
        tx,
        hashToken(token),
        "email_verification",
        now,
      );
      if (!owner) return false;
      await this.d.users.markEmailVerified(tx, owner.userId, now);
      return true;
    });
    if (!ok) throw new TokenInvalidError();
  }

  async resendVerification(claims: AccessClaims): Promise<void> {
    const mail = await withPlatform(this.d.database, "reenvío de verificación", async (tx) => {
      const user = await this.d.users.findById(tx, claims.userId);
      if (!user || user.emailVerifiedAt) return null;
      return this.createVerificationMail(tx, user);
    });
    if (mail) await this.d.mailer.send(mail);
  }

  /** Crea un token de verificación y devuelve el correo a enviar (el envío es POST-commit). */
  async createVerificationMail(tx: Tx, user: UserRecord) {
    const now = this.d.clock.now();
    await this.d.tokens.invalidateUserTokens(tx, user.id, "email_verification", now);
    const token = generateToken();
    await this.d.tokens.saveUserToken(tx, {
      userId: user.id,
      kind: "email_verification",
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + VERIFICATION_TTL_MS),
    });
    return verifyEmailMail(user.email, this.d.publicUrl, token);
  }

  assertPasswordPolicy(password: string, identity: { email?: string; fullName?: string }): void {
    const problem = checkPassword(password, identity);
    if (problem) throw new WeakPasswordError(problem);
  }

  /** Aceptación de invitación (ver ARCHITECTURE §7): cuenta nueva → sesión; cuenta existente → debe iniciar sesión. */
  async acceptInvitation(
    input: { token: string; fullName?: string | undefined; password?: string | undefined },
    meta: RequestMeta,
  ): Promise<{ kind: "session"; session: IssuedSession } | { kind: "accepted" }> {
    type Outcome =
      | { kind: "session"; session: IssuedSession }
      | { kind: "accepted" }
      | { kind: "fail"; error: AppError };
    const outcome = await withPlatform<Outcome>(
      this.d.database,
      "aceptar invitación",
      async (tx) => {
        const now = this.d.clock.now();
        const inv = await this.d.invitations.findByTokenHash(tx, hashToken(input.token));
        if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt <= now) {
          return {
            kind: "fail",
            error: new AppError("auth.invitation_invalid", 400, "Invitación no válida o caducada"),
          };
        }

        const limit = await this.d.seats.limitFor(
          tx,
          inv.tenantId,
          inv.seatType as "full" | "light",
        );
        if (limit !== null) {
          const used = await this.d.memberships.countActiveBySeat(tx, inv.seatType);
          // Los asientos ya cuentan la invitación pendiente al crearla; aquí solo se cuenta lo activo.
          if (used >= limit) {
            return {
              kind: "fail",
              error: new AppError("limit.exceeded", 403, "Sin asientos libres", {
                limit: `seats:${inv.seatType}`,
                max: limit,
              }),
            };
          }
        }

        const existing = await this.d.users.findByEmail(tx, inv.email);
        if (existing) {
          if (!(await this.d.memberships.findByUserAndTenant(tx, existing.id, inv.tenantId))) {
            const created = await this.d.memberships.insert(tx, {
              tenantId: inv.tenantId,
              userId: existing.id,
              role: inv.role,
              seatType: inv.seatType,
            });
            await this.emitMembershipCreated(tx, inv.tenantId, created, now);
          }
          await this.d.invitations.markAccepted(tx, inv.id, now);
          return { kind: "accepted" };
        }

        if (!input.fullName || !input.password) {
          return {
            kind: "fail",
            error: new AppError("validation.failed", 400, "Faltan nombre y contraseña"),
          };
        }
        this.assertPasswordPolicy(input.password, { email: inv.email, fullName: input.fullName });
        const user = await this.d.users.insert(tx, {
          email: inv.email,
          passwordHash: await this.d.hasher.hash(input.password),
          fullName: input.fullName,
          locale: "es",
          emailVerified: true, // la invitación llegó a ese email
        });
        const membership = await this.d.memberships.insert(tx, {
          tenantId: inv.tenantId,
          userId: user.id,
          role: inv.role,
          seatType: inv.seatType,
        });
        await this.d.invitations.markAccepted(tx, inv.id, now);
        await this.emitMembershipCreated(tx, inv.tenantId, membership, now);
        await this.d.audit.record(
          tx,
          { tenantId: inv.tenantId, actor: { membershipId: membership.id, source: "user" } },
          {
            action: "identity.invitation_accepted",
            entityType: "membership",
            entityId: membership.id,
            after: { role: inv.role, seatType: inv.seatType },
          },
        );
        return { kind: "session", session: await this.issueSession(tx, user, membership, meta) };
      },
    );
    if (outcome.kind === "fail") throw outcome.error;
    return outcome;
  }

  /** Evento `identity.membership.created` al aceptar una invitación (lo consume, p. ej., el onboarding). */
  private async emitMembershipCreated(
    tx: Tx,
    tenantId: string,
    m: { id: string; userId: string; role: string; seatType: string; status?: string },
    now: Date,
  ) {
    await publishEvent(tx, {
      id: uuidv7(),
      ...EVENT_TYPES.membershipCreated,
      tenantId,
      occurredAt: now.toISOString(),
      actor: { membershipId: m.id, source: "user" },
      entity: { type: "membership", id: m.id },
      payload: membershipChangedV1.parse({
        membershipId: m.id,
        userId: m.userId,
        role: m.role,
        seatType: m.seatType,
        status: m.status ?? "active",
      }),
    });
  }

  /** Crea la cuenta del propietario de un tenant nuevo (puerto `OwnerProvisioner` de tenancy). */
  async provisionOwner(
    tx: Tx,
    args: {
      tenantId: string;
      tenantName: string;
      email: string;
      fullName: string;
      password: string | undefined;
    },
  ) {
    const existing = await this.d.users.findByEmail(tx, args.email);
    let userId: string;
    let isNewUser = false;
    if (existing) {
      userId = existing.id;
    } else {
      if (args.password !== undefined) {
        this.assertPasswordPolicy(args.password, { email: args.email, fullName: args.fullName });
      }
      // Alta manual: contraseña aleatoria inutilizable; el propietario fija la suya desde el email.
      const hash = await this.d.hasher.hash(args.password ?? generateToken(48));
      const user = await this.d.users.insert(tx, {
        email: args.email,
        passwordHash: hash,
        fullName: args.fullName,
        locale: "es",
        emailVerified: false,
      });
      userId = user.id;
      isNewUser = true;
    }
    const membership = await this.d.memberships.insert(tx, {
      tenantId: args.tenantId,
      userId,
      role: "owner",
      seatType: "full",
    });
    return { userId, membershipId: membership.id, isNewUser };
  }
}
