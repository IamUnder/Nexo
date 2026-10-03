/**
 * Códigos de error estables que la API devuelve y la web traduce vía i18n.
 * Nunca se devuelve un mensaje interno al cliente (AGENTS.md §6).
 */
export const ERROR_CODES = [
  "auth.unauthenticated",
  "auth.token_expired",
  "auth.forbidden",
  "auth.invalid_credentials",
  "auth.account_locked",
  "auth.token_invalid",
  "auth.invitation_invalid",
  "account.exists",
  "password.weak",
  "email.unverified",
  "member.last_owner",
  "member.seat_invalid",
  "deal.lost_reason_required",
  "deal.next_action_required",
  "deal.closed_amount_locked",
  "deal.already_closed",
  "deal.not_closed",
  "crm.account_has_open_deals",
  "crm.contact_email_taken",
  "crm.stage_has_deals",
  "crm.invalid_stages",
  "crm.invalid_owner",
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
