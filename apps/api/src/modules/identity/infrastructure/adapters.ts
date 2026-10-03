import {
  EVENT_TYPES,
  type Role,
  type SeatType,
  type TenantCreatedV1,
  tenantCreatedV1,
} from "@nexo/contracts";
import { generateToken, hashToken } from "../../../platform/crypto/tokens";
import type { Database, Tx } from "../../../platform/db/database";
import { withPlatform } from "../../../platform/db/platform";
import { ForbiddenError, UnauthenticatedError } from "../../../platform/errors";
import type { EventSubscriber } from "../../../platform/events/subscribers";
import type {
  AccessClaims,
  AccessTokenVerifier,
  Clock,
  PermissionResolver,
  SystemMailer,
} from "../../../platform/ports";
import { ownerAddedMail, ownerWelcomeMail } from "../application/emails";
import type {
  MembershipRepository,
  OverrideRepository,
  TokenStore,
  UserRepository,
} from "../application/ports";
import { scopeFor } from "../domain/permissions";
import type { JoseTokenService } from "./crypto";

/** Nombre del suscriptor (da nombre a su cola); fuente única para la composición y `migrate`. */
export const TENANT_CREATED_MAILS = "identity.tenant_created_mails";

/** Implementa `AccessTokenVerifier` del kernel con el servicio JWT de identity. */
export class JwtAccessTokenVerifier implements AccessTokenVerifier {
  constructor(private readonly jwt: JoseTokenService) {}
  verify(token: string): Promise<AccessClaims> {
    return this.jwt.verifyAccess(token);
  }
}

/**
 * Implementa `PermissionResolver` del kernel. El rol y el asiento se leen de la BD en CADA petición
 * (no del token): un cambio de rol o una suspensión surten efecto de inmediato, no a los 15 minutos.
 */
export class DbPermissionResolver implements PermissionResolver {
  constructor(
    private readonly memberships: MembershipRepository,
    private readonly overrides: OverrideRepository,
  ) {}

  async assertActive(
    tx: Tx,
    claims: AccessClaims & { tenantId: string; membershipId: string },
  ): Promise<void> {
    const m = await this.memberships.findById(tx, claims.membershipId);
    if (
      !m ||
      m.tenantId !== claims.tenantId ||
      m.userId !== claims.userId ||
      m.status !== "active"
    ) {
      throw new UnauthenticatedError("Membresía no activa");
    }
  }

  async scopeFor(
    tx: Tx,
    claims: AccessClaims & { tenantId: string; membershipId: string },
    permission: string,
  ) {
    const m = await this.memberships.findById(tx, claims.membershipId);
    if (!m || m.status !== "active") throw new ForbiddenError("Membresía no activa");
    const overrides = await this.overrides.list(tx, claims.tenantId);
    return scopeFor(m.role as Role, m.seatType as SeatType, permission as never, overrides);
  }
}

/**
 * Tras crear un tenant, el propietario recibe el correo que corresponde:
 *  · alta manual con cuenta nueva → «fija tu contraseña»
 *  · alta manual con cuenta existente → «ahora eres propietario de…»
 *  · alta self-service → «confirma tu email»
 * Se hace desde un suscriptor (outbox) porque el alta ocurre en la transacción de tenancy y el correo
 * solo debe salir una vez confirmada. Los tokens se generan AQUÍ: nunca viajan por el outbox.
 */
export function tenantCreatedMailSubscriber(deps: {
  database: Database;
  users: UserRepository;
  tokens: TokenStore;
  mailer: SystemMailer;
  clock: Clock;
  publicUrl: string;
  verifyMail: (
    tx: Tx,
    user: { id: string; email: string },
  ) => Promise<{ to: string; subject: string; text: string }>;
}): EventSubscriber<TenantCreatedV1> {
  return {
    name: TENANT_CREATED_MAILS,
    eventType: EVENT_TYPES.tenantCreated.type,
    version: EVENT_TYPES.tenantCreated.version,
    payloadSchema: tenantCreatedV1,
    async handle({ event }) {
      const p = event.payload;
      const mail = await withPlatform(
        deps.database,
        "correo de bienvenida del propietario",
        async (tx) => {
          const user = await deps.users.findById(tx, p.ownerUserId);
          if (!user) return null;
          if (p.origin === "manual") {
            if (!p.ownerIsNewUser)
              return ownerAddedMail({
                to: user.email,
                baseUrl: deps.publicUrl,
                tenantName: p.name,
              });
            const token = generateToken();
            const now = deps.clock.now();
            await deps.tokens.saveUserToken(tx, {
              userId: user.id,
              kind: "password_reset",
              tokenHash: hashToken(token),
              expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            });
            return ownerWelcomeMail({
              to: user.email,
              baseUrl: deps.publicUrl,
              token,
              tenantName: p.name,
            });
          }
          if (user.emailVerifiedAt) return null;
          return deps.verifyMail(tx, user);
        },
      );
      if (mail) await deps.mailer.send(mail);
    },
  };
}
