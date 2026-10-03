import type { PermissionScope } from "@nexo/contracts";
import type { Tx } from "./db/database";
import type { TenantContext } from "./tenant/context";

/**
 * Puertos del KERNEL: contratos que los módulos usan sin conocerse entre sí (ARCHITECTURE §4.3).
 * Las implementaciones concretas las aporta cada módulo de plataforma y las cablea `composition/`.
 */

/** Reloj inyectable: los tests controlan el tiempo (caducidad de pruebas, tokens, bloqueos). */
export interface Clock {
  now(): Date;
}
export const systemClock: Clock = { now: () => new Date() };

// ── Auditoría ───────────────────────────────────────────────────────────────────────────────
export interface AuditEntry {
  /** Acción estable `<área>.<hecho>`, p. ej. `identity.member.role_changed`. */
  action: string;
  entityType?: string;
  entityId?: string;
  /** Estado antes/después SIN secretos ni PII innecesaria. */
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AuditLogger {
  /** Registra una acción de TENANT dentro de la transacción del caso de uso (se revierte con ella). */
  record(tx: Tx, ctx: TenantContext, entry: AuditEntry): Promise<void>;
  /** Registra una acción de PLATAFORMA (superadmin, login fallido sin tenant…). */
  recordPlatform(
    tx: Tx,
    actor: { superadminId: string | null; ip?: string | undefined },
    entry: AuditEntry,
  ): Promise<void>;
}

// ── Correo del sistema (invitaciones, verificación, recuperación) ───────────────────────────
export interface SystemEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface SystemMailer {
  send(email: SystemEmail): Promise<void>;
}

// ── Almacenamiento de archivos ──────────────────────────────────────────────────────────────
export interface FileStorage {
  /** URL firmada de subida (PUT) de corta vida. La CLAVE la construye el servidor, nunca el cliente. */
  presignUpload(key: string, contentType: string, maxBytes: number): Promise<string>;
  /** URL firmada de descarga (GET) de corta vida. */
  presignDownload(key: string, filename: string): Promise<string>;
  /** Metadatos del objeto subido, o null si no existe. */
  head(key: string): Promise<{ size: number; contentType: string | undefined } | null>;
  delete(key: string): Promise<void>;
}

// ── Autenticación y autorización (las implementa `identity`) ────────────────────────────────
export interface AccessClaims {
  scope: "tenant" | "platform";
  userId: string;
  tenantId?: string;
  membershipId?: string;
  role?: string;
  seat?: string;
}

export interface AccessTokenVerifier {
  /** Lanza `UnauthenticatedError` si el token no es válido o ha caducado. */
  verify(token: string): Promise<AccessClaims>;
}

export interface PermissionResolver {
  /** Lanza `UnauthenticatedError` si la membresía no existe o no está activa (p. ej. suspendida). */
  assertActive(
    tx: Tx,
    claims: AccessClaims & { tenantId: string; membershipId: string },
  ): Promise<void>;
  /** ¿Puede esta membresía ejecutar `permission`? Devuelve el alcance (`own`|`all`) o null si no. */
  scopeFor(
    tx: Tx,
    claims: AccessClaims & { tenantId: string; membershipId: string },
    permission: string,
  ): Promise<PermissionScope | null>;
}

// ── Estado del tenant y entitlements ────────────────────────────────────────────────────────
export interface TenantGate {
  /** Lanza `TenantBlockedError` si el tenant no puede operar (prueba caducada, suspendido…). */
  assertCanOperate(tx: Tx, tenantId: string, options: { allowWhenBlocked: boolean }): Promise<void>;
}

export interface EntitlementProvider {
  /** ¿Tiene el tenant contratada esta clave (`module:crm`, `seats:full`…)? */
  has(tx: Tx, tenantId: string, key: string): Promise<boolean>;
}

/** Conjunto de servicios que `composition/` inyecta en la app y los guards. */
export interface PlatformPorts {
  clock: Clock;
  audit: AuditLogger;
  mailer: SystemMailer;
  files: FileStorage;
  tokens: AccessTokenVerifier;
  permissions: PermissionResolver;
  tenantGate: TenantGate;
  entitlements: EntitlementProvider;
}
