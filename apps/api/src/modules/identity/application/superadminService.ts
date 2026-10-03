import { randomUUID } from "node:crypto";
import type { AdminSessionResponse } from "@nexo/contracts";
import { generateToken, hashToken } from "../../../platform/crypto/tokens";
import type { Database } from "../../../platform/db/database";
import { withPlatform } from "../../../platform/db/platform";
import { UnauthenticatedError } from "../../../platform/errors";
import type { AuditLogger, Clock } from "../../../platform/ports";
import { isLocked, lockUntilAfterFailure } from "../domain/lockout";
import { AccountLockedError, InvalidCredentialsError, type RequestMeta } from "./authService";
import type { PasswordHasher, SuperadminRepository, TokenService, TokenStore } from "./ports";

export interface SuperadminDeps {
  database: Database;
  superadmins: SuperadminRepository;
  tokens: TokenStore;
  hasher: PasswordHasher;
  jwt: TokenService;
  audit: AuditLogger;
  clock: Clock;
}

export interface AdminIssued {
  body: AdminSessionResponse;
  refreshToken: string;
  refreshExpiresAt: Date;
}

/**
 * Sesión del superadmin de plataforma: tabla, login, tokens y cookie PROPIOS (`scope: platform`).
 * Un token de superadmin nunca vale en rutas de tenant y viceversa (guards por ámbito).
 */
export class SuperadminService {
  private dummyHash: Promise<string> | undefined;
  constructor(private readonly d: SuperadminDeps) {}

  private fakeHash() {
    this.dummyHash ??= this.d.hasher.hash(randomUUID());
    return this.dummyHash;
  }

  private async issue(
    tx: Parameters<Parameters<typeof withPlatform>[2]>[0],
    admin: { id: string; email: string; fullName: string },
    meta: RequestMeta,
    familyId: string = randomUUID(),
  ): Promise<AdminIssued> {
    const now = this.d.clock.now();
    const refreshToken = generateToken();
    const refreshExpiresAt = new Date(
      now.getTime() + Math.min(this.d.jwt.refreshTtlMs, 24 * 60 * 60 * 1000),
    );
    await this.d.tokens.saveRefresh(tx, {
      familyId,
      tokenHash: hashToken(refreshToken),
      subjectType: "superadmin",
      subjectId: admin.id,
      membershipId: null,
      expiresAt: refreshExpiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return {
      body: {
        accessToken: await this.d.jwt.signAccess({ scope: "platform", userId: admin.id }),
        expiresIn: this.d.jwt.accessTtlSeconds,
        admin: { id: admin.id, email: admin.email, fullName: admin.fullName },
      },
      refreshToken,
      refreshExpiresAt,
    };
  }

  async login(input: { email: string; password: string }, meta: RequestMeta): Promise<AdminIssued> {
    type Outcome = { kind: "ok"; session: AdminIssued } | { kind: "fail"; locked: boolean };
    const outcome = await withPlatform<Outcome>(
      this.d.database,
      "login de superadmin",
      async (tx) => {
        const now = this.d.clock.now();
        const admin = await this.d.superadmins.findByEmail(tx, input.email);
        if (!admin) {
          await this.d.hasher.verify(await this.fakeHash(), input.password);
          return { kind: "fail", locked: false };
        }
        const valid = await this.d.hasher.verify(admin.passwordHash, input.password);
        if (!valid || admin.status !== "active") {
          const failures = admin.failedLogins + 1;
          await this.d.superadmins.recordFailure(
            tx,
            admin.id,
            failures,
            lockUntilAfterFailure(failures, now),
          );
          await this.d.audit.recordPlatform(
            tx,
            { superadminId: admin.id, ip: meta.ip },
            {
              action: "admin.login_failed",
              entityType: "superadmin",
              entityId: admin.id,
              metadata: { failures },
            },
          );
          return { kind: "fail", locked: false };
        }
        if (isLocked(admin.lockedUntil, now)) return { kind: "fail", locked: true };

        await this.d.superadmins.resetFailures(tx, admin.id);
        await this.d.audit.recordPlatform(
          tx,
          { superadminId: admin.id, ip: meta.ip },
          {
            action: "admin.login",
            entityType: "superadmin",
            entityId: admin.id,
          },
        );
        return { kind: "ok", session: await this.issue(tx, admin, meta) };
      },
    );
    if (outcome.kind === "fail")
      throw outcome.locked ? new AccountLockedError() : new InvalidCredentialsError();
    return outcome.session;
  }

  async refresh(token: string, meta: RequestMeta): Promise<AdminIssued> {
    type Outcome = { kind: "ok"; session: AdminIssued } | { kind: "fail" };
    const outcome = await withPlatform<Outcome>(
      this.d.database,
      "refresh de superadmin",
      async (tx) => {
        const now = this.d.clock.now();
        const rec = await this.d.tokens.findRefreshByHash(tx, hashToken(token));
        if (!rec || rec.subjectType !== "superadmin") return { kind: "fail" };
        if (rec.rotatedAt) {
          await this.d.tokens.revokeFamily(tx, rec.familyId, now);
          return { kind: "fail" };
        }
        if (rec.revokedAt || rec.expiresAt <= now) return { kind: "fail" };
        const admin = await this.d.superadmins.findById(tx, rec.subjectId);
        if (!admin || admin.status !== "active") {
          await this.d.tokens.revokeFamily(tx, rec.familyId, now);
          return { kind: "fail" };
        }
        await this.d.tokens.markRefreshRotated(tx, rec.id, now);
        return { kind: "ok", session: await this.issue(tx, admin, meta, rec.familyId) };
      },
    );
    if (outcome.kind === "fail") throw new UnauthenticatedError("Sesión no válida");
    return outcome.session;
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await withPlatform(this.d.database, "cierre de sesión de superadmin", async (tx) => {
      const rec = await this.d.tokens.findRefreshByHash(tx, hashToken(token));
      if (rec) await this.d.tokens.revokeFamily(tx, rec.familyId, this.d.clock.now());
    });
  }

  async me(adminId: string) {
    return withPlatform(this.d.database, "perfil de superadmin", async (tx) => {
      const admin = await this.d.superadmins.findById(tx, adminId);
      if (!admin || admin.status !== "active") throw new UnauthenticatedError("Sesión no válida");
      return { id: admin.id, email: admin.email, fullName: admin.fullName };
    });
  }

  /** Crea el superadmin inicial (idempotente por email). Lo usa `db:seed`. */
  async bootstrap(
    email: string,
    password: string,
    fullName = "Superadmin",
  ): Promise<"created" | "exists"> {
    return withPlatform(this.d.database, "bootstrap del superadmin", async (tx) => {
      if (await this.d.superadmins.findByEmail(tx, email)) return "exists" as const;
      await this.d.superadmins.insert(tx, {
        email,
        passwordHash: await this.d.hasher.hash(password),
        fullName,
      });
      return "created" as const;
    });
  }
}
