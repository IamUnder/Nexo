import { expect, test } from "@playwright/test";
import { expectAccessible, setTheme, signup } from "./support/helpers";

test("deal ganado → proyecto con plantilla; tareas, tiempo y proyectos en la ficha de empresa", async ({
  page,
}) => {
  await signup(page);
  // Los datos de ejemplo incluyen oportunidades ganadas: su evento crea los proyectos.
  await page.getByRole("link", { name: "Oportunidades", exact: true }).click();
  await page.getByRole("button", { name: "Cargar datos de ejemplo" }).click();
  await expect(page.getByText("Auditoría de procesos")).toBeVisible();

  await page.getByRole("link", { name: "Proyectos", exact: true }).click();
  // Los proyectos llegan por evento (outbox + worker): se reintenta recargando.
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("link", { name: "Auditoría de procesos" })).toBeVisible({
      timeout: 2_000,
    });
  }).toPass({ timeout: 45_000 });
  await expectAccessible(page);
  await setTheme(page, "dark");
  await expectAccessible(page);
  await setTheme(page, "light");

  await page.getByRole("link", { name: "Auditoría de procesos" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Auditoría de procesos" }),
  ).toBeVisible();
  await expect(page.getByText("Reunión de kickoff con el cliente")).toBeVisible();
  await expect(page.getByText(/^Kickoff/).first()).toBeVisible();

  await page.getByLabel("Nueva tarea").fill("Revisar entregables");
  await page.getByRole("button", { name: "Añadir" }).click();
  await expect(page.getByText("Revisar entregables")).toBeVisible();
  await page.getByLabel("Estado de «Revisar entregables»").selectOption("done");

  await page.getByLabel("Minutos").fill("90");
  await page.getByLabel("Nota").fill("Reunión");
  await page.getByRole("button", { name: "Registrar tiempo" }).click();
  await expect(page.getByText("1 h 30 min · Reunión")).toBeVisible();
  await expectAccessible(page);

  // La ficha de la empresa muestra sus proyectos (hueco rellenado por el router).
  await page.getByRole("link", { name: "Empresas", exact: true }).click();
  await page.getByRole("button", { name: "Aurora Logística" }).click();
  await expect(page.getByRole("heading", { name: "Proyectos" })).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Proyectos" })
      .getByRole("link", { name: "Auditoría de procesos" }),
  ).toBeVisible();
});
