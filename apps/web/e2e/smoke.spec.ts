import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("el shell carga, está en español y alterna el tema", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Bienvenido a Nexo" })).toBeVisible();

  await page.getByRole("button", { name: "Cambiar a tema oscuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // El tema elegido se conserva al recargar.
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

for (const theme of ["light", "dark"] as const) {
  test(`sin violaciones de accesibilidad (WCAG AA) · tema ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => window.localStorage.setItem("nexo.theme", t), theme);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    expect(results.violations).toEqual([]);
  });
}
