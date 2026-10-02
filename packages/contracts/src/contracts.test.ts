import { describe, expect, it } from "vitest";
import {
  entitlementKey,
  eventEnvelopeSchema,
  isPermissionAllowedForSeat,
  MODULE_KEYS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
} from "./index";

describe("contratos", () => {
  it("las claves de módulo son únicas", () => {
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length);
  });

  it("todo rol tiene su paquete de permisos y solo con permisos conocidos", () => {
    for (const role of ROLES) {
      const perms = ROLE_PERMISSIONS[role];
      expect(perms, role).toBeDefined();
      for (const p of perms) expect(PERMISSIONS).toContain(p);
    }
  });

  it("un asiento Light solo admite permisos de lectura", () => {
    expect(isPermissionAllowedForSeat("identity:member:read", "light")).toBe(true);
    expect(isPermissionAllowedForSeat("identity:member:manage", "light")).toBe(false);
    expect(isPermissionAllowedForSeat("identity:member:manage", "full")).toBe(true);
  });

  it("deriva claves de entitlement", () => {
    expect(entitlementKey.module("crm")).toBe("module:crm");
    expect(entitlementKey.seats("light")).toBe("seats:light");
    expect(entitlementKey.limit("pipelines")).toBe("limit:pipelines");
  });

  it("valida el sobre de eventos", () => {
    const ok = {
      id: "0190f8a0-7c1b-7d2e-8a3b-1c2d3e4f5a6b",
      type: "crm.deal.won",
      version: 1,
      tenantId: "0190f8a0-7c1b-7d2e-8a3b-1c2d3e4f5a6c",
      occurredAt: "2026-10-03T10:00:00.000Z",
      actor: { membershipId: null, source: "system" },
      entity: { type: "deal", id: "0190f8a0-7c1b-7d2e-8a3b-1c2d3e4f5a6d" },
      payload: { dealId: "x" },
    };
    expect(eventEnvelopeSchema.safeParse(ok).success).toBe(true);
    expect(eventEnvelopeSchema.safeParse({ ...ok, type: "NoValido" }).success).toBe(false);
    expect(eventEnvelopeSchema.safeParse({ ...ok, tenantId: "no-uuid" }).success).toBe(false);
  });
});
