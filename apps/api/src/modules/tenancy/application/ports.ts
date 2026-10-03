import type { Tx } from "../../../platform/db/database";

/** Fila de tenant tal como la ve el módulo. */
export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  status: string;
  trialEndsAt: Date | null;
  origin: string;
  isDemo: boolean;
  locale: string;
  timezone: string;
  currency: string;
  country: string | null;
  flags: Record<string, unknown>;
  createdAt: Date;
}

export interface NewTenant {
  slug: string;
  name: string;
  status: string;
  trialEndsAt: Date | null;
  origin: "self_service" | "manual";
  country: string | null;
}

export interface TenantListQuery {
  limit: number;
  cursor?: string | undefined;
  search?: string | undefined;
  status?: string | undefined;
}

/** Persistencia de tenants. La implementa `infrastructure/tenantRepository.ts`. */
export interface TenantRepository {
  slugExists(tx: Tx, slug: string): Promise<boolean>;
  insert(tx: Tx, value: NewTenant): Promise<TenantRecord>;
  findById(tx: Tx, id: string): Promise<TenantRecord | null>;
  list(
    tx: Tx,
    query: TenantListQuery,
  ): Promise<{ items: TenantRecord[]; nextCursor: string | null }>;
  update(
    tx: Tx,
    id: string,
    patch: Partial<
      Pick<
        TenantRecord,
        "name" | "status" | "trialEndsAt" | "locale" | "timezone" | "currency" | "flags"
      >
    >,
  ): Promise<TenantRecord>;
  getSettings(tx: Tx, tenantId: string): Promise<Record<string, unknown>>;
  putSetting(tx: Tx, tenantId: string, key: string, value: unknown): Promise<void>;
}

// ── Puertos hacia OTROS módulos (los cablea `composition/`; ARCHITECTURE §4.3) ──────────────

/** Qué necesita tenancy de identity para dar de alta al propietario de un tenant. */
export interface OwnerProvisioner {
  /**
   * Crea (o reutiliza) la cuenta del propietario y su membresía `owner` DENTRO de la transacción `tx`.
   * Sin `password` (alta manual por el superadmin) la cuenta queda sin contraseña utilizable y se envía
   * al propietario un email para fijarla.
   */
  provisionOwner(
    tx: Tx,
    args: {
      tenantId: string;
      tenantName: string;
      email: string;
      fullName: string;
      password: string | undefined;
    },
  ): Promise<{ userId: string; membershipId: string; isNewUser: boolean }>;
}

/** Sesión emitida tras un alta (la implementa identity: access token + refresh token). */
export interface IssuedSession {
  body: unknown;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export interface SessionIssuer {
  issue(args: {
    userId: string;
    membershipId: string;
    ip?: string | undefined;
    userAgent?: string | undefined;
  }): Promise<IssuedSession>;
}

/** Recuento de miembros por tenant (lo ofrece identity; tenancy no lee sus tablas). */
export interface MemberStats {
  countByTenant(tx: Tx, tenantIds: string[]): Promise<Map<string, number>>;
}
