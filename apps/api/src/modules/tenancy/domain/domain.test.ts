import { describe, expect, it } from "vitest";
import { generateUniqueSlug, isAssignableSlug, slugify } from "./slug";
import { addDays, canOperate, effectiveStatus } from "./status";

describe("slugify", () => {
  it.each([
    ["Acme Digital S.L.", "acme-digital-s-l"],
    ["Ñandú & Compañía", "nandu-compania"],
    ["  --Mi Empresa--  ", "mi-empresa"],
    ["AB", "ab-co"],
    ["!!!", "empresa"],
  ])("%s → %s", (input, out) => {
    expect(slugify(input)).toBe(out);
  });

  it("nunca supera 40 caracteres ni produce guiones al final", () => {
    const s = slugify("a".repeat(100));
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("isAssignableSlug", () => {
  it("rechaza reservados y formatos inválidos", () => {
    for (const bad of ["admin", "api", "demo", "-x-", "ab", "Mayus", "con espacio"]) {
      expect(isAssignableSlug(bad), bad).toBe(false);
    }
    expect(isAssignableSlug("mi-empresa-2")).toBe(true);
  });
});

describe("generateUniqueSlug", () => {
  it("añade sufijos numéricos ante choques", async () => {
    const taken = new Set(["acme", "acme-2"]);
    expect(await generateUniqueSlug("Acme", async (s) => taken.has(s))).toBe("acme-3");
  });

  it("evita los slugs reservados", async () => {
    expect(await generateUniqueSlug("Admin", async () => false)).toBe("admin-co");
  });

  it("cae a un sufijo aleatorio si hay demasiados choques", async () => {
    const s = await generateUniqueSlug(
      "Acme",
      async () => true,
      () => "zzzzz",
    );
    expect(s).toBe("acme-zzzzz");
    expect(isAssignableSlug(s)).toBe(true);
  });
});

describe("estado efectivo del tenant", () => {
  const now = new Date("2026-10-10T12:00:00Z");

  it("una prueba caducada figura como trial_expired y no puede operar", () => {
    const t = { status: "trial", trialEndsAt: addDays(now, -1) };
    expect(effectiveStatus(t, now)).toBe("trial_expired");
    expect(canOperate("trial_expired", null, now)).toBe(false);
  });

  it("una prueba vigente opera", () => {
    const t = { status: "trial", trialEndsAt: addDays(now, 3) };
    expect(effectiveStatus(t, now)).toBe("trial");
    expect(canOperate("trial", null, now)).toBe(true);
  });

  it("un tenant active ignora trial_ends_at", () => {
    expect(effectiveStatus({ status: "active", trialEndsAt: addDays(now, -30) }, now)).toBe(
      "active",
    );
  });

  it("past_due tiene 7 días de gracia", () => {
    expect(canOperate("past_due", addDays(now, -6), now)).toBe(true);
    expect(canOperate("past_due", addDays(now, -8), now)).toBe(false);
  });

  it.each(["suspended", "cancelled"] as const)("%s no opera", (s) => {
    expect(canOperate(s, null, now)).toBe(false);
  });
});
