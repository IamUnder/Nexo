import { describe, expect, it } from "vitest";
import {
  ConflictError,
  EntitlementError,
  ForbiddenError,
  LimitExceededError,
  NotFoundError,
  TenantBlockedError,
  toApiError,
  UnauthenticatedError,
  ValidationError,
} from "./index";

describe("toApiError", () => {
  it.each([
    [new UnauthenticatedError(), 401, "auth.unauthenticated"],
    [new TenantBlockedError(), 402, "tenant.blocked"],
    [new ForbiddenError(), 403, "auth.forbidden"],
    [new EntitlementError("crm"), 403, "entitlement.missing"],
    [new LimitExceededError("seats:full", 5), 403, "limit.exceeded"],
    [new ValidationError(), 400, "validation.failed"],
    [new NotFoundError(), 404, "resource.not_found"],
    [new ConflictError(), 409, "resource.conflict"],
  ])("mapea %o a %i / %s", (error, status, code) => {
    const mapped = toApiError(error, "req-1");
    expect(mapped.status).toBe(status);
    expect(mapped.body.error.code).toBe(code);
    expect(mapped.body.error.requestId).toBe("req-1");
  });

  it("incluye parámetros de interpolación cuando existen", () => {
    expect(toApiError(new LimitExceededError("seats:full", 5)).body.error.params).toEqual({
      limit: "seats:full",
      max: 5,
    });
  });

  it("NUNCA filtra mensajes internos de errores desconocidos", () => {
    const mapped = toApiError(new Error("password=secreto en la consulta SQL"));
    expect(mapped.status).toBe(500);
    expect(JSON.stringify(mapped.body)).not.toContain("secreto");
    expect(mapped.body.error.code).toBe("internal.error");
  });

  it("el mensaje interno de un AppError tampoco llega al cuerpo", () => {
    const body = JSON.stringify(toApiError(new EntitlementError("crm")).body);
    expect(body).not.toContain("Módulo no contratado");
  });
});
