import type { ApiErrorBody, ErrorCode } from "@nexo/contracts";

/**
 * Jerarquía de errores de aplicación (AGENTS.md §6). Cada error lleva un `code` estable que la web
 * traduce vía i18n; el `message` es solo para logs y NUNCA se devuelve al cliente.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly httpStatus: number,
    message: string,
    readonly params?: Record<string, string | number | boolean>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "No autenticado") {
    super("auth.unauthenticated", 401, message);
  }
}

/** Access token caducado: el cliente debe refrescar la sesión (código distinto de «no autenticado»). */
export class TokenExpiredError extends AppError {
  constructor() {
    super("auth.token_expired", 401, "Token caducado");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Permiso insuficiente") {
    super("auth.forbidden", 403, message);
  }
}

export class TenantBlockedError extends AppError {
  constructor(message = "Tenant bloqueado") {
    super("tenant.blocked", 402, message);
  }
}

export class EntitlementError extends AppError {
  constructor(moduleKey: string) {
    super("entitlement.missing", 403, `Módulo no contratado: ${moduleKey}`, { module: moduleKey });
  }
}

export class LimitExceededError extends AppError {
  constructor(limit: string, max: number) {
    super("limit.exceeded", 403, `Límite superado: ${limit}`, { limit, max });
  }
}

export class ValidationError extends AppError {
  constructor(message = "Datos no válidos") {
    super("validation.failed", 400, message);
  }
}

/** 404 tanto si no existe como si pertenece a otro tenant: nunca se revela la existencia. */
export class NotFoundError extends AppError {
  constructor(entity = "recurso") {
    super("resource.not_found", 404, `${entity} no encontrado`);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflicto con el estado actual") {
    super("resource.conflict", 409, message);
  }
}

/** Traduce cualquier error al cuerpo seguro que ve el cliente. */
export function toApiError(
  error: unknown,
  requestId?: string,
): { status: number; body: ApiErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.httpStatus,
      body: {
        error: {
          code: error.code,
          ...(error.params ? { params: error.params } : {}),
          ...(requestId ? { requestId } : {}),
        },
      },
    };
  }
  return {
    status: 500,
    body: { error: { code: "internal.error", ...(requestId ? { requestId } : {}) } },
  };
}
