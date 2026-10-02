/**
 * Códigos de error estables que la API devuelve y la web traduce vía i18n.
 * Nunca se devuelve un mensaje interno al cliente (AGENTS.md §6).
 */
export const ERROR_CODES = [
  "auth.unauthenticated",
  "auth.token_expired",
  "auth.forbidden",
  "tenant.blocked",
  "entitlement.missing",
  "limit.exceeded",
  "validation.failed",
  "resource.not_found",
  "resource.conflict",
  "rate_limit.exceeded",
  "internal.error",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ApiErrorBody {
  error: {
    code: ErrorCode | (string & {});
    /** Datos para interpolar en la traducción (p. ej. el límite superado). Nunca PII ni trazas. */
    params?: Record<string, string | number | boolean>;
    requestId?: string;
  };
}
