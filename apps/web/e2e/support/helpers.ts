import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const PASSWORD = "caballo bateria grapa correcta";
let seq = 0;
export const unique = (prefix: string) => `${prefix}${Date.now().toString(36)}${++seq}`;

export async function signup(page: Page, prefix = "owner", company = `Empresa ${unique("co")}`) {
  const email = `${unique(prefix)}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Tu nombre").fill("Lucía Prueba");
  await page.getByLabel("Nombre de tu empresa").fill(company);
  await page.getByLabel("Email de trabajo").fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Acepto los términos de uso y la política de privacidad").check();
  await page.getByRole("button", { name: "Crear mi espacio" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /Hola, Lucía/ })).toBeVisible();
  return { email, company };
}

export async function login(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Contraseña", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

/** Accesibilidad WCAG 2.x AA con axe sobre la pantalla actual. */
export async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  const summary = results.violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
  expect(summary, "violaciones de accesibilidad").toEqual([]);
}

export async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
  // Espera a que terminen las transiciones de color (axe mediría colores intermedios y daría falsos positivos).
  await page.waitForTimeout(450);
}
