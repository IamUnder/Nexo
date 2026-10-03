import { describe, expect, it } from "vitest";
import {
  applyMapping,
  domainOf,
  foldKey,
  identityKey,
  normalizeCompany,
  normalizeContact,
  normalizePhone,
  normalizeTaxId,
  splitFullName,
  toCsv,
  validateMapping,
} from "./normalize";

describe("normalización de importación", () => {
  it("foldKey ignora tildes, mayúsculas y espacios repetidos", () => {
    expect(foldKey("  Ñandú   TECNOLOGÍAS ")).toBe("nandu tecnologias");
  });

  it("NIF/CIF: mayúsculas sin separadores", () => {
    expect(normalizeTaxId("b-12.345 678")).toBe("B12345678");
  });

  it("dominio desde web o email-like", () => {
    expect(domainOf("https://www.Acme.ES/inicio?x=1")).toBe("acme.es");
    expect(domainOf("acme.es:8080")).toBe("acme.es");
  });

  it("teléfono conserva el prefijo internacional", () => {
    expect(normalizePhone("+34 612 345-678")).toBe("+34612345678");
    expect(normalizePhone("0034 612 345 678")).toBe("+34612345678");
    expect(normalizePhone("612 345 678")).toBe("612345678");
  });

  it("nombre completo se parte en nombre y apellidos", () => {
    expect(splitFullName("Ana María Pérez López")).toEqual({
      firstName: "Ana",
      lastName: "María Pérez López",
    });
  });

  it("empresa válida: normaliza NIF, dominio, web y teléfono", () => {
    const r = normalizeCompany({
      name: "  Acme S.L. ",
      taxId: "b-123.456.78",
      website: "www.acme.es",
      phone: "+34 600 000 000",
    });
    expect(r.errors).toEqual([]);
    expect(r.fields).toEqual({
      name: "Acme S.L.",
      taxId: "B12345678",
      domain: "acme.es",
      website: "https://www.acme.es",
      phone: "+34600000000",
    });
  });

  it("empresa sin nombre o con dominio inválido es rechazada con motivo", () => {
    expect(normalizeCompany({ name: " " }).errors[0]).toMatch(/obligatorio/);
    expect(normalizeCompany({ name: "Acme", domain: "no es un dominio" }).errors).toContain(
      "El dominio no es válido",
    );
  });

  it("contacto: minúsculas en el email y nombre completo", () => {
    const r = normalizeContact({
      fullName: "Eva Ruiz Gil",
      email: " EVA@Acme.ES ",
      jobTitle: "CTO",
    });
    expect(r.errors).toEqual([]);
    expect(r.fields).toEqual({
      firstName: "Eva",
      lastName: "Ruiz Gil",
      email: "eva@acme.es",
      jobTitle: "CTO",
    });
  });

  it("contacto con email roto o sin nombre se rechaza", () => {
    expect(normalizeContact({ firstName: "Eva", email: "eva@" }).errors).toContain(
      "El email no es válido",
    );
    expect(normalizeContact({ email: "a@b.es" }).errors[0]).toMatch(/nombre/);
  });

  it("mapeo: aplica y valida campos obligatorios, desconocidos y columnas inexistentes", () => {
    expect(applyMapping({ name: "Empresa", phone: "Tel" }, { Empresa: "Acme", Tel: "1" })).toEqual({
      name: "Acme",
      phone: "1",
    });
    const cols = new Set(["Empresa", "Tel"]);
    expect(validateMapping("companies", { name: "Empresa" }, cols)).toBeNull();
    expect(validateMapping("companies", { phone: "Tel" }, cols)).toMatch(/falta mapear name/);
    expect(validateMapping("companies", { name: "Nope" }, cols)).toMatch(/columna inexistente/);
    expect(validateMapping("companies", { name: "Empresa", color: "Tel" }, cols)).toMatch(
      /desconocido/,
    );
    expect(validateMapping("contacts", { fullName: "Empresa" }, cols)).toBeNull();
  });

  it("clave de identidad: email para contactos; NIF o nombre para empresas", () => {
    expect(identityKey("contacts", { email: "a@b.es" })).toBe("email:a@b.es");
    expect(identityKey("contacts", { firstName: "A" })).toBeNull();
    expect(identityKey("companies", { name: "Ñu", taxId: "B1" })).toBe("tax:B1");
    expect(identityKey("companies", { name: "Ñu" })).toBe("name:nu");
  });

  it("CSV de exportación: separador ;, comillas escapadas, BOM y CRLF", () => {
    const csv = toCsv(
      ["a", "b"],
      [
        { a: "x;y", b: 'di "hola"' },
        { a: "ñ", b: "" },
      ],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿a;b\r\n"x;y";"di ""hola"""\r\nñ;\r\n');
  });
});
