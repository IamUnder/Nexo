import { expect, test } from "@playwright/test";
import { expectAccessible, setTheme, signup } from "./support/helpers";

test("checklist de primeros pasos: refleja lo que ocurre, se oculta y se retoma", async ({
  page,
}) => {
  await signup(page);
  await expect(page.getByRole("heading", { name: "Primeros pasos" })).toBeVisible();
  await expect(page.getByText("0 de 4 pasos completados")).toBeVisible();
  await expect(page.getByText("Próximamente")).toBeVisible(); // el buzón aún no existe
  await expectAccessible(page);

  // Cargar datos de ejemplo crea oportunidades y proyectos (por eventos): el checklist avanza solo.
  await page.getByRole("link", { name: "Oportunidades", exact: true }).click();
  await page.getByRole("button", { name: "Cargar datos de ejemplo" }).click();
  await expect(page.getByText("Auditoría de procesos")).toBeVisible();
  await page.getByRole("link", { name: "Inicio", exact: true }).click();
  await expect(page.getByText("2 de 4 pasos completados")).toBeVisible({ timeout: 45_000 });
  await setTheme(page, "dark");
  await expectAccessible(page);
  await setTheme(page, "light");

  await page.getByRole("button", { name: "Ocultar" }).click();
  await expect(page.getByRole("heading", { name: "Primeros pasos" })).toBeHidden();
  await page.getByRole("button", { name: "Mostrar los primeros pasos" }).click();
  await expect(page.getByRole("heading", { name: "Primeros pasos" })).toBeVisible();
});
