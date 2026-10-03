import type { ModuleKey, Permission } from "@nexo/contracts";
import { entitlementKey } from "@nexo/contracts";
import type { FastifyRequest, preHandlerAsyncHookHandler } from "fastify";
import type { Database } from "../db/database";
import { EntitlementError, ForbiddenError, UnauthenticatedError } from "../errors";
import type { AccessClaims, PlatformPorts } from "../ports";
import type { TenantContext } from "../tenant/context";

declare module "fastify" {
  interface FastifyRequest {
    /** Claims del access token verificado (los pone `guard`). */
    auth?: AccessClaims;
    /** Alcance de datos concedido por el permiso exigido (`own` | `all`). */
    permissionScope?: "own" | "all";
  }
}

export interface GuardOptions {
  /** `tenant` (por defecto) o `platform` (superadmin). Un token de otro ámbito se rechaza. */
  scope?: "tenant" | "platform";
  /** Módulo contratado que debe tener el tenant (`module:<key>`). */
  entitlement?: ModuleKey;
  /** Permiso RBAC `<módulo>:<recurso>:<acción>`. */
  permission?: Permission;
  /** Rutas que siguen funcionando con el tenant bloqueado (exportar datos, facturación). */
  allowWhenBlocked?: boolean;
}

function bearer(req: FastifyRequest): string {
  const header = req.headers.authorization;
  const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null;
  if (!match?.[1]) throw new UnauthenticatedError("Falta la cabecera Authorization");
  return match[1];
}

/**
 * Fábrica de guards. Aplica SIEMPRE el mismo orden (ARCHITECTURE §7.2), que determina el código de error:
 *   1 autenticación (401) → 2 estado del tenant (402) → 3 entitlement (403) → 4 permiso (403).
 * El recurso concreto devuelve 404 si no existe o es de otro tenant (nunca 403, que revelaría su existencia).
 */
export function createGuards(deps: { database: Database; ports: PlatformPorts }) {
  const { database, ports } = deps;

  function guard(options: GuardOptions = {}): preHandlerAsyncHookHandler {
    const scope = options.scope ?? "tenant";
    return async (req) => {
      // 1 · autenticación
      const claims = await ports.tokens.verify(bearer(req));
      if (claims.scope !== scope) throw new UnauthenticatedError("Token de otro ámbito");
      req.auth = claims;
      if (scope === "platform") return;

      const { tenantId, membershipId } = claims;
      if (!tenantId || !membershipId) throw new UnauthenticatedError("Token sin tenant");

      await database.withTenant({ tenantId }, async (tx) => {
        // 2 · estado del tenant
        await ports.tenantGate.assertCanOperate(tx, tenantId, {
          allowWhenBlocked: options.allowWhenBlocked ?? false,
        });
        // La membresía debe seguir activa: un miembro suspendido pierde el acceso al instante,
        // aunque su access token (15 min) aún no haya caducado.
        await ports.permissions.assertActive(tx, { ...claims, tenantId, membershipId });
        // 3 · entitlement
        if (options.entitlement) {
          const ok = await ports.entitlements.has(
            tx,
            tenantId,
            entitlementKey.module(options.entitlement),
          );
          if (!ok) throw new EntitlementError(options.entitlement);
        }
        // 4 · permiso
        if (options.permission) {
          const granted = await ports.permissions.scopeFor(
            tx,
            { ...claims, tenantId, membershipId },
            options.permission,
          );
          if (!granted) throw new ForbiddenError(`Falta el permiso ${options.permission}`);
          req.permissionScope = granted;
        }
      });
    };
  }

  /**
   * ¿Tiene la petición autenticada este permiso ADICIONAL? Para reglas finas dentro de un caso de uso
   * (p. ej. cambiar el importe de una oportunidad ganada exige `crm:deal:manage`).
   */
  async function can(req: FastifyRequest, permission: Permission): Promise<boolean> {
    const claims = req.auth;
    if (!claims || claims.scope !== "tenant" || !claims.tenantId || !claims.membershipId)
      return false;
    const { tenantId, membershipId } = claims;
    return database.withTenant({ tenantId }, async (tx) => {
      const scope = await ports.permissions.scopeFor(
        tx,
        { ...claims, tenantId, membershipId },
        permission,
      );
      return scope !== null;
    });
  }

  return Object.assign(guard, { can });
}

export type Guard = ReturnType<typeof createGuards>;

/** Contexto de tenant de la petición. Solo válido tras un `guard()` de ámbito tenant. */
export function tenantContextOf(req: FastifyRequest): TenantContext {
  const claims = req.auth;
  if (!claims || claims.scope !== "tenant" || !claims.tenantId) {
    throw new UnauthenticatedError("Contexto de tenant no disponible");
  }
  return {
    tenantId: claims.tenantId,
    actor: { membershipId: claims.membershipId ?? null, source: "user" },
    requestId: req.id,
  };
}

export function platformActorOf(req: FastifyRequest): { superadminId: string } {
  const claims = req.auth;
  if (!claims || claims.scope !== "platform")
    throw new UnauthenticatedError("Contexto de plataforma no disponible");
  return { superadminId: claims.userId };
}
