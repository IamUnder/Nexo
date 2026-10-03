import { expect, test } from "@playwright/test";
import { expectAccessible, setTheme, signup } from "./support/helpers";

test.describe("CRM: del alta de una empresa a ganar una oportunidad", () => {
  test("flujo comercial completo con búsqueda, timeline, tareas y accesibilidad", async ({
    page,
  }) => {
    await signup(page);

    // ── Empresa ──────────────────────────────────────────────────────────────────────────────
    await page.getByRole("link", { name: "Empresas", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Empresas" })).toBeVisible();
    await expect(page.getByText("Aún no hay empresas")).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("button", { name: "Nueva empresa" }).first().click();
    await page.getByLabel("Nombre comercial").fill("Ñandú Tecnologías");
    await page.getByLabel("Dominio web").fill("nandu.test");
    await page.getByRole("button", { name: "Crear empresa" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ñandú Tecnologías" })).toBeVisible();

    // ── Contacto desde la ficha de la empresa ───────────────────────────────────────────────
    await page.getByRole("button", { name: "Añadir contacto" }).click();
    await page.getByLabel("Nombre", { exact: true }).fill("Eva");
    await page.getByLabel("Apellidos").fill("Ruiz");
    await page.getByLabel("Email", { exact: true }).fill("eva@nandu.test");
    await page.getByRole("button", { name: "Crear contacto" }).click();
    await expect(page.getByText("Eva Ruiz")).toBeVisible();

    // ── Oportunidad: exige siguiente acción ─────────────────────────────────────────────────
    await page.getByRole("button", { name: "Nueva oportunidad" }).first().click();
    await page.getByLabel("Nombre", { exact: true }).fill("Rediseño web");
    await page.getByLabel("Importe (€)").fill("12000");
    await page.getByRole("button", { name: "Crear oportunidad" }).click();
    await expect(page.getByText("Indica la siguiente acción o su fecha.")).toBeVisible();
    await page.getByLabel("Siguiente acción", { exact: true }).fill("Enviar propuesta");
    await page.getByRole("button", { name: "Crear oportunidad" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Rediseño web" })).toBeVisible();
    await expect(page.getByText("Abierta", { exact: true })).toBeVisible();

    // ── Mover de etapa y registrar actividad ────────────────────────────────────────────────
    await page.getByLabel("Etapa", { exact: true }).selectOption({ label: "Propuesta" });
    await expect(page.getByText("Prospecto → Propuesta")).toBeVisible();
    await page.getByLabel("Resumen").fill("Llamada de seguimiento");
    await page.getByLabel("Tipo", { exact: true }).selectOption("call");
    await page.getByRole("button", { name: "Registrar" }).click();
    await expect(page.getByText("Llamada de seguimiento")).toBeVisible();

    // ── Tarea desde la oportunidad ──────────────────────────────────────────────────────────
    await page.getByRole("button", { name: "Nueva tarea" }).click();
    await page.getByLabel("Tarea", { exact: true }).fill("Preparar demo");
    await page.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByText("Preparar demo")).toBeVisible();
    await expectAccessible(page);

    // ── Tablero ─────────────────────────────────────────────────────────────────────────────
    await page.getByRole("link", { name: "Oportunidades", exact: true }).click();
    const column = page.getByRole("region", { name: "Propuesta" });
    await expect(column.getByText("Rediseño web")).toBeVisible();
    await expect(column.getByText("12.000 €", { exact: true })).toBeVisible();
    await expectAccessible(page);
    await setTheme(page, "dark");
    await expectAccessible(page);
    await setTheme(page, "light");

    // Mover con el menú accesible (alternativa al arrastre).
    await page.getByRole("button", { name: "Acciones de Rediseño web" }).click();
    await page.getByRole("menuitem", { name: /Negociación/ }).click();
    await expect(
      page.getByRole("region", { name: "Negociación" }).getByText("Rediseño web"),
    ).toBeVisible();

    // ── Ganar ───────────────────────────────────────────────────────────────────────────────
    await page.getByRole("link", { name: "Rediseño web" }).click();
    await page.getByRole("button", { name: "Marcar como ganada" }).click();
    await expect(page.getByText("Ganada", { exact: true }).first()).toBeVisible();
    await page.getByRole("button", { name: "Reabrir" }).click();
    await expect(page.getByText("Abierta", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Marcar como perdida" }).click();
    await page.getByLabel("Motivo").fill("Eligió a la competencia");
    await page.getByRole("dialog").getByRole("button", { name: "Marcar como perdida" }).click();
    await expect(
      page.getByRole("definition").filter({ hasText: "Eligió a la competencia" }),
    ).toBeVisible();

    // ── Búsqueda global ─────────────────────────────────────────────────────────────────────
    await page.getByLabel("Buscar en el CRM").fill("nandu");
    await page.getByRole("button", { name: /Ñandú Tecnologías/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Ñandú Tecnologías" })).toBeVisible();

    // ── Mis tareas ──────────────────────────────────────────────────────────────────────────
    await page.getByRole("link", { name: "Tareas", exact: true }).click();
    await expect(page.getByText("Preparar demo")).toBeVisible();
    await page.getByRole("checkbox", { name: /Completar «Preparar demo»/ }).click();
    await expect(page.getByText("No tienes tareas pendientes")).toBeVisible();
    await page.getByRole("tab", { name: "Hechas" }).click();
    await expect(page.getByText("Preparar demo")).toBeVisible();
    await expectAccessible(page);

    // ── Panel de ventas (read models alimentados por eventos: llegan vía outbox + worker) ──
    await page.getByRole("link", { name: "Inicio", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Panel de ventas" })).toBeVisible();
    await expect(page.getByText("0 ganadas · 1 perdidas")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Eligió a la competencia").first()).toBeVisible();
    await expectAccessible(page);
    await setTheme(page, "dark");
    await expectAccessible(page);
    await setTheme(page, "light");

    // ── Contactos ───────────────────────────────────────────────────────────────────────────
    await page.getByRole("link", { name: "Contactos", exact: true }).click();
    await expect(page.getByRole("cell", { name: "Eva Ruiz" })).toBeVisible();
    await expectAccessible(page);
  });

  test("datos de ejemplo: cargar, explorar el tablero y quitarlos", async ({ page }) => {
    await signup(page);
    await page.getByRole("link", { name: "Oportunidades", exact: true }).click();
    await expect(page.getByText("Aún no hay oportunidades")).toBeVisible();

    await page.getByRole("button", { name: "Cargar datos de ejemplo" }).click();
    await expect(page.getByText("Auditoría de procesos")).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Ganada" }).getByText("Auditoría de procesos"),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Perdida" }).getByText("ERP ligero"),
    ).toBeVisible();
    await expectAccessible(page);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "Quitar datos de ejemplo" }).click();
    await expect(page.getByText("Aún no hay oportunidades")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cargar datos de ejemplo" })).toBeVisible();
  });
});

test("editor de embudo: renombrar una etapa y añadir otra", async ({ page }) => {
  await signup(page);
  await page.getByRole("link", { name: "Oportunidades", exact: true }).click();
  await page.getByRole("link", { name: "Embudo de ventas" }).click();
  await expect(page.getByRole("heading", { name: "Embudo de ventas" })).toBeVisible();
  await page.getByLabel("Etapa").first().fill("Lead");
  await page.getByRole("button", { name: "Añadir etapa" }).click();
  await page.getByLabel("Etapa").last().fill("Demo");
  await page.getByRole("button", { name: "Guardar embudo" }).click();
  await expect(page.getByText("Embudo guardado")).toBeVisible();
  await expectAccessible(page);
});
