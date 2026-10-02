import { describe, expect, it } from "vitest";
import { assertValidTenantId } from "./context";
import {
  createTenantResolver,
  RESERVED_SLUGS,
  SessionTenantResolver,
  SLUG_RE,
  SubdomainTenantResolver,
} from "./resolver";

describe("SessionTenantResolver", () => {
  it("no deduce tenant antes de autenticar", () => {
    expect(new SessionTenantResolver().resolveSlugPreAuth()).toBeNull();
  });
});

describe("SubdomainTenantResolver", () => {
  const resolver = new SubdomainTenantResolver("nexo.example");

  it("extrae el slug del subdominio", () => {
    expect(resolver.resolveSlugPreAuth("acme.nexo.example")).toBe("acme");
    expect(resolver.resolveSlugPreAuth("Acme.Nexo.Example:443")).toBe("acme");
  });

  it("ignora dominios ajenos, el dominio base y slugs reservados", () => {
    expect(resolver.resolveSlugPreAuth("acme.otro.com")).toBeNull();
    expect(resolver.resolveSlugPreAuth("nexo.example")).toBeNull();
    expect(resolver.resolveSlugPreAuth("app.nexo.example")).toBeNull();
    expect(resolver.resolveSlugPreAuth(undefined)).toBeNull();
  });

  it("rechaza etiquetas no válidas como slug", () => {
    expect(resolver.resolveSlugPreAuth("-malo-.nexo.example")).toBeNull();
    expect(resolver.resolveSlugPreAuth("a.b.nexo.example")).toBeNull();
  });
});

describe("createTenantResolver", () => {
  it("exige dominio base en modo subdomain", () => {
    expect(() => createTenantResolver("subdomain")).toThrow(/NEXO_BASE_DOMAIN/);
    expect(createTenantResolver("session")).toBeInstanceOf(SessionTenantResolver);
  });
});

describe("slugs", () => {
  it("los reservados incluyen los críticos", () => {
    for (const s of ["app", "api", "www", "admin", "demo"])
      expect(RESERVED_SLUGS.has(s)).toBe(true);
  });
  it("valida el formato DNS", () => {
    expect(SLUG_RE.test("mi-empresa-2")).toBe(true);
    expect(SLUG_RE.test("Mayus")).toBe(false);
    expect(SLUG_RE.test("ab")).toBe(false);
  });
});

describe("assertValidTenantId", () => {
  it("acepta UUID y rechaza cualquier otra cosa (incluida inyección)", () => {
    expect(() => assertValidTenantId("0190f8a0-7c1b-7d2e-8a3b-1c2d3e4f5a6b")).not.toThrow();
    expect(() => assertValidTenantId("x'; drop table tenants;--")).toThrow();
    expect(() => assertValidTenantId("")).toThrow();
  });
});
