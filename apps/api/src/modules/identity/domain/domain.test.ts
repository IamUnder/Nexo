import { PERMISSIONS } from "@nexo/contracts";
import { describe, expect, it } from "vitest";
import { isLocked, lockUntilAfterFailure } from "./lockout";
import { canInviteRole, checkMemberChange } from "./members";
import { checkPassword } from "./password";
import { effectivePermissions, isSeatCompatibleWithRole, scopeFor } from "./permissions";

describe("política de contraseñas", () => {
  it.each([
    ["corta1!", "too_short"],
    ["Contraseña123", "too_common"],
    ["aaaaaaaaaaaaaaa", "too_repetitive"],
    ["ababababababab", "too_repetitive"],
  ] as const)("rechaza %s", (pwd, problem) => {
    expect(checkPassword(pwd)).toBe(problem);
  });

  it("rechaza contraseñas que contienen el email o el nombre", () => {
    expect(checkPassword("maria.lopez-2026!", { email: "maria.lopez@acme.com" })).toBe(
      "contains_identity",
    );
    expect(checkPassword("Soy-Fernando-1980", { fullName: "Fernando Ruiz" })).toBe(
      "contains_identity",
    );
  });

  it("acepta una frase larga razonable", () => {
    expect(
      checkPassword("caballo bateria grapa correcta", { email: "a@b.com", fullName: "Ana Gil" }),
    ).toBeNull();
  });
});

describe("permisos efectivos", () => {
  it("owner conserva todo aunque haya overrides que se lo quiten", () => {
    const all = effectivePermissions("owner", "full", [
      { role: "owner", permission: "audit:log:read", granted: false },
    ]);
    expect(all).toEqual([...PERMISSIONS]);
  });

  it("aplica los ajustes del tenant sobre el paquete por defecto", () => {
    const base = effectivePermissions("sales", "full", []);
    expect(base).not.toContain("audit:log:read");
    const withOverride = effectivePermissions("sales", "full", [
      { role: "sales", permission: "audit:log:read", granted: true },
    ]);
    expect(withOverride).toContain("audit:log:read");
    const revoked = effectivePermissions("sales", "full", [
      { role: "sales", permission: "files:file:create", granted: false },
    ]);
    expect(revoked).not.toContain("files:file:create");
  });

  it("los ajustes de otro rol no afectan", () => {
    const p = effectivePermissions("viewer", "full", [
      { role: "manager", permission: "files:file:delete", granted: true },
    ]);
    expect(p).not.toContain("files:file:delete");
  });

  it("un asiento Light solo conserva permisos de lectura, incluso con override", () => {
    const p = effectivePermissions("sales", "light", [
      { role: "sales", permission: "files:file:delete", granted: true },
    ]);
    expect(p.every((x) => x.endsWith(":read"))).toBe(true);
  });

  it("scopeFor devuelve null sin permiso y alcance según el rol", () => {
    expect(scopeFor("viewer", "full", "identity:member:manage", [])).toBeNull();
    expect(scopeFor("admin", "full", "identity:member:manage", [])).toBe("all");
    expect(scopeFor("sales", "full", "files:file:read", [])).toBe("own");
  });

  it("roles de gestión exigen asiento Full", () => {
    expect(isSeatCompatibleWithRole("owner", "light")).toBe(false);
    expect(isSeatCompatibleWithRole("admin", "light")).toBe(false);
    expect(isSeatCompatibleWithRole("manager", "light")).toBe(false);
    expect(isSeatCompatibleWithRole("viewer", "light")).toBe(true);
    expect(isSeatCompatibleWithRole("sales", "light")).toBe(true);
  });
});

describe("cambios de miembros", () => {
  const base = {
    actorRole: "admin",
    actorIsTarget: false,
    targetRole: "sales",
    activeOwners: 1,
    change: {},
  } as const;

  it("solo un owner puede tocar o crear owners", () => {
    expect(
      checkMemberChange({ ...base, targetRole: "owner", change: { status: "suspended" } }),
    ).toBe("owner_only");
    expect(checkMemberChange({ ...base, change: { role: "owner" } })).toBe("owner_only");
    expect(
      checkMemberChange({ ...base, actorRole: "owner", change: { role: "owner" } }),
    ).toBeNull();
  });

  it("nunca deja el tenant sin owner", () => {
    const f = { ...base, actorRole: "owner", targetRole: "owner", activeOwners: 1 } as const;
    expect(checkMemberChange({ ...f, change: { role: "admin" } })).toBe("last_owner");
    expect(checkMemberChange({ ...f, change: { status: "suspended" } })).toBe("last_owner");
    expect(
      checkMemberChange({ ...f, activeOwners: 2, actorIsTarget: false, change: { role: "admin" } }),
    ).toBeNull();
  });

  it("nadie cambia su propio rol ni se suspende a sí mismo", () => {
    expect(checkMemberChange({ ...base, actorIsTarget: true, change: { role: "manager" } })).toBe(
      "cannot_edit_self_role",
    );
    expect(
      checkMemberChange({ ...base, actorIsTarget: true, change: { status: "suspended" } }),
    ).toBe("cannot_suspend_self");
  });

  it("invitar: nunca como owner; solo owner/admin invitan", () => {
    expect(canInviteRole("owner", "owner")).toBe(false);
    expect(canInviteRole("admin", "sales")).toBe(true);
    expect(canInviteRole("manager", "sales")).toBe(false);
  });
});

describe("bloqueo progresivo", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  it("no bloquea antes del 5.º fallo", () => {
    expect(lockUntilAfterFailure(4, now)).toBeNull();
  });
  it("5 fallos → 15 min; los siguientes duplican hasta 24 h", () => {
    expect(lockUntilAfterFailure(5, now)?.getTime()).toBe(now.getTime() + 15 * 60_000);
    expect(lockUntilAfterFailure(6, now)?.getTime()).toBe(now.getTime() + 30 * 60_000);
    expect(lockUntilAfterFailure(30, now)?.getTime()).toBe(now.getTime() + 24 * 60 * 60_000);
  });
  it("isLocked respeta el instante", () => {
    expect(isLocked(new Date(now.getTime() + 1), now)).toBe(true);
    expect(isLocked(new Date(now.getTime() - 1), now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
});
