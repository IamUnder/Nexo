import { describe, expect, it } from "vitest";
import { suggestMapping } from "./suggest";

describe("sugerencia de mapeo", () => {
  it("empresas: cabeceras típicas de Excel en español", () => {
    expect(
      suggestMapping("companies", [
        "Razón social",
        "Empresa",
        "CIF/NIF",
        "Teléfono",
        "Sitio web",
        "Sector",
      ]),
    ).toEqual({
      legalName: "Razón social",
      name: "Empresa",
      taxId: "CIF/NIF",
      phone: "Teléfono",
      website: "Sitio web",
      industry: "Sector",
    });
  });

  it("contactos: distingue nombre, apellidos y nombre completo; cada columna se usa una vez", () => {
    expect(
      suggestMapping("contacts", ["Nombre", "Apellidos", "E-mail", "Empresa", "Cargo"]),
    ).toEqual({
      firstName: "Nombre",
      lastName: "Apellidos",
      email: "E-mail",
      companyName: "Empresa",
      jobTitle: "Cargo",
    });
    expect(suggestMapping("contacts", ["Nombre completo", "Email"])).toEqual({
      fullName: "Nombre completo",
      email: "Email",
    });
  });

  it("cabeceras en inglés y columnas desconocidas se ignoran", () => {
    expect(suggestMapping("companies", ["Company", "Phone", "Favorite color"])).toEqual({
      name: "Company",
      phone: "Phone",
    });
  });
});
