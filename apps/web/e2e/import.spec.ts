import { expect, test } from "@playwright/test";
import { expectAccessible, setTheme, signup } from "./support/helpers";

const CSV = [
  "Empresa;CIF;Teléfono;Sitio web",
  "Acme Industrial S.L.;b-12345678;+34 600 111 222;www.acme.es",
  "Ñandú Software;;;",
  ";B99999999;;", // rechazada: sin nombre
  "acme industrial s.l.;B12345678;;", // repetida en el fichero
].join("\r\n");

test("importar empresas desde un CSV: simular, importar, ver el resultado y deshacer", async ({
  page,
}) => {
  await signup(page);
  await page.getByRole("link", { name: "Importar", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Importar y exportar" })).toBeVisible();
  await expectAccessible(page);

  // El fichero se lee en el navegador; las columnas se relacionan solas.
  await page.getByLabel("Fichero CSV").setInputFiles({
    name: "empresas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(CSV, "utf8"),
  });
  await expect(page.getByText("empresas.csv · 4 filas")).toBeVisible();
  await expect(page.getByLabel("Nombre", { exact: true })).toHaveValue("Empresa");
  await expect(page.getByLabel("NIF/CIF")).toHaveValue("CIF");
  await expectAccessible(page);

  // Simulación: nada se escribe todavía.
  await page.getByRole("button", { name: "Simular importación" }).click();
  await expect(page.getByText("Todavía no se ha escrito nada en tu CRM.")).toBeVisible();
  await expect(page.getByText("Filas con avisos o errores")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Repetida en el fichero/ })).toBeVisible();
  await expectAccessible(page);
  await setTheme(page, "dark");
  await expectAccessible(page);
  await setTheme(page, "light");

  // Importar (asíncrono): termina y se ven los resultados.
  await page.getByRole("button", { name: "Importar 2 registros" }).click();
  await expect(page.getByText("Completado", { exact: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: "Deshacer importación" })).toBeVisible();

  // Las empresas están en el CRM, normalizadas.
  await page.getByRole("link", { name: "Empresas", exact: true }).click();
  await expect(page.getByRole("cell", { name: /Acme Industrial S\.L\./ })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Ñandú Software/ })).toBeVisible();
  await expect(page.getByText("acme.es")).toBeVisible();

  // Deshacer: vuelve al estado anterior.
  await page.getByRole("link", { name: "Importar", exact: true }).click();
  await page.getByRole("button", { name: "Abrir" }).first().click();
  page.once("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Deshacer importación" }).click();
  await expect(page.getByText("Deshecho", { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Empresas", exact: true }).click();
  await expect(page.getByText("Aún no hay empresas")).toBeVisible();
});
