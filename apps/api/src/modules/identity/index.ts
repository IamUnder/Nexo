/**
 * Módulo `identity` (plataforma): usuarios, sesión, invitaciones, roles y permisos, y sesión del
 * superadmin. Superficie pública: lo único que `composition/` necesita. Los puertos hacia otros módulos
 * (`TenantDirectory`, `SeatPolicy`, `ModuleCatalog`) los cablea la composición.
 */
import type { FastifyInstance } from "fastify";
import type { SigningKeys } from "../../platform/config/env";
import type { Database, Tx } from "../../platform/db/database";
import type { createGuards } from "../../platform/http/guards";
import type {
  AccessTokenVerifier,
  AuditLogger,
  Clock,
  PermissionResolver,
  SystemMailer,
} from "../../platform/ports";
import { AuthService } from "./application/authService";
import type {
  ModuleCatalog,
  PasswordHasher,
  SeatPolicy,
  TenantDirectory,
} from "./application/ports";
import { SuperadminService } from "./application/superadminService";
import { TeamService } from "./application/teamService";
import { registerIdentityRoutes } from "./http/routes";
import {
  DbPermissionResolver,
  JwtAccessTokenVerifier,
  TENANT_CREATED_MAILS,
  tenantCreatedMailSubscriber,
} from "./infrastructure/adapters";
import { Argon2Hasher, JoseTokenService } from "./infrastructure/crypto";
import {
  DbInvitationRepository,
  DbMembershipRepository,
  DbOverrideRepository,
  DbSuperadminRepository,
  DbTokenStore,
  DbUserRepository,
} from "./infrastructure/repositories";

export type { PasswordHasher } from "./application/ports";

/** Suscriptores que registra este módulo (nombres estáticos: `migrate` crea sus colas sin arrancar nada). */
export const IDENTITY_SUBSCRIBER_NAMES = [TENANT_CREATED_MAILS] as const;
export { Argon2Hasher } from "./infrastructure/crypto";

export interface IdentityModule {
  auth: AuthService;
  team: TeamService;
  superadmin: SuperadminService;
  tokens: AccessTokenVerifier;
  permissions: PermissionResolver;
  /** Puertos que ofrece a otros módulos (los cablea la composición). */
  owners: AuthService;
  sessions: { issue: AuthService["issueForMembership"] };
  members: { countByTenant: TeamService["countByTenant"] };
  /** Directorio de miembros que ofrece a otros módulos (nombres y comprobación de miembro activo). */
  directory: {
    names(tx: Tx, membershipIds: string[]): Promise<Map<string, string>>;
    isActiveMember(tx: Tx, membershipId: string): Promise<boolean>;
  };
  subscribers: ReturnType<typeof tenantCreatedMailSubscriber>[];
  registerRoutes(app: FastifyInstance): void;
}

export function createIdentityModule(deps: {
  database: Database;
  guard: ReturnType<typeof createGuards>;
  audit: AuditLogger;
  mailer: SystemMailer;
  clock: Clock;
  signingKeys: SigningKeys;
  accessTtlSeconds: number;
  refreshTtlDays: number;
  publicUrl: string;
  cookieSecure: boolean;
  tenants: TenantDirectory;
  seats: SeatPolicy;
  modules: ModuleCatalog;
  /** Parámetros de Argon2 (los tests usan costes bajos; producción, los por defecto). */
  hasher?: PasswordHasher;
}): IdentityModule {
  const users = new DbUserRepository();
  const memberships = new DbMembershipRepository();
  const invitations = new DbInvitationRepository();
  const tokens = new DbTokenStore();
  const overrides = new DbOverrideRepository();
  const superadmins = new DbSuperadminRepository();
  const hasher = deps.hasher ?? new Argon2Hasher();
  const jwt = new JoseTokenService(
    deps.signingKeys,
    { accessTtlSeconds: deps.accessTtlSeconds, refreshTtlDays: deps.refreshTtlDays },
    () => deps.clock.now(),
  );

  const auth = new AuthService({
    database: deps.database,
    users,
    memberships,
    invitations,
    tokens,
    overrides,
    hasher,
    jwt,
    tenants: deps.tenants,
    seats: deps.seats,
    modules: deps.modules,
    audit: deps.audit,
    mailer: deps.mailer,
    clock: deps.clock,
    publicUrl: deps.publicUrl,
  });
  const team = new TeamService({
    database: deps.database,
    users,
    memberships,
    invitations,
    overrides,
    seats: deps.seats,
    tenants: deps.tenants,
    audit: deps.audit,
    mailer: deps.mailer,
    clock: deps.clock,
    publicUrl: deps.publicUrl,
  });
  const superadmin = new SuperadminService({
    database: deps.database,
    superadmins,
    tokens,
    hasher,
    jwt,
    audit: deps.audit,
    clock: deps.clock,
  });

  return {
    auth,
    team,
    superadmin,
    tokens: new JwtAccessTokenVerifier(jwt),
    permissions: new DbPermissionResolver(memberships, overrides),
    owners: auth,
    sessions: { issue: (args) => auth.issueForMembership(args) },
    members: { countByTenant: (tx, ids) => team.countByTenant(tx, ids) },
    directory: {
      async names(tx, ids) {
        // Bajo withTenant: RLS limita memberships y users a este tenant.
        const wanted = new Set(ids);
        const all = await memberships.listForTenant(tx);
        return new Map(all.filter((m) => wanted.has(m.id)).map((m) => [m.id, m.fullName]));
      },
      async isActiveMember(tx, id) {
        const m = await memberships.findById(tx, id);
        return m?.status === "active";
      },
    },
    subscribers: [
      tenantCreatedMailSubscriber({
        database: deps.database,
        users,
        tokens,
        mailer: deps.mailer,
        clock: deps.clock,
        publicUrl: deps.publicUrl,
        verifyMail: async (tx, user) => {
          const full = await users.findById(tx, user.id);
          if (!full) throw new Error("usuario no encontrado");
          return auth.createVerificationMail(tx, full);
        },
      }),
    ],
    registerRoutes: (app) =>
      registerIdentityRoutes(app, {
        auth,
        team,
        superadmin,
        guard: deps.guard,
        cookieSecure: deps.cookieSecure,
        publicOrigin: new URL(deps.publicUrl).origin,
      }),
  };
}
