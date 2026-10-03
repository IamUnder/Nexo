import { expect, test } from "@playwright/test";
import { expectAccessible, login, PASSWORD, setTheme, signup, unique } from "./support/helpers";
import { pathOf, waitForMail } from "./support/mail";
import { E2E } from "./support/stack";

test.describe("alta, sesión y verificación", () => {
  test("alta self-service → verificación por correo real → la sesión sobrevive a recargar → logout", async ({
    page,
  }) => {
    const { email, company } = await signup(page);

    // Aviso de email sin confirmar y datos de la cuenta.
    await expect(page.getByText("Confirma tu email para poder invitar a tu equipo.")).toBeVisible();
    await expect(page.getByText(company).first()).toBeVisible();
    await expect(page.getByText("Propietario")).toBeVisible();

    // El correo llega por el outbox + worker + SMTP reales.
    const mail = await waitForMail(email, "Confirma tu email");
    await page.goto(pathOf(mail.link));
    await expect(page.getByRole("heading", { name: "Email confirmado" })).toBeVisible();

    await page.getByRole("link", { name: "Ir a Nexo" }).click();
    await expect(page.getByText("Confirma tu email para poder invitar a tu equipo.")).toBeHidden();

    // Recargar NO pierde la sesión (se restaura con la cookie de refresh, sin pedir credenciales).
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: /Hola, Lucía/ })).toBeVisible();

    // Cerrar sesión devuelve al login y una ruta privada vuelve a redirigir.
    await page.getByRole("button", { name: "Menú de cuenta" }).click();
    await page.getByRole("menuitem", { name: "Cerrar sesión" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/team");
    await expect(page).toHaveURL(/\/login/);
  });

  test("credenciales incorrectas muestran un error claro y el formulario valida en cliente", async ({
    page,
  }) => {
    const { email } = await signup(page);
    await page.context().clearCookies();
    await page.goto("/login");

    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByText("Este campo es obligatorio.").first()).toBeVisible();

    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Contraseña", { exact: true }).fill("contraseña equivocada!!");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "El email o la contraseña no son correctos." }),
    ).toBeVisible();
  });

  test("recuperar contraseña: enlace de un solo uso por correo y acceso con la nueva", async ({
    page,
  }) => {
    const { email } = await signup(page);
    await page.context().clearCookies();

    await page.goto("/forgot-password");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByRole("button", { name: "Enviar enlace" }).click();
    await expect(page.getByText("Si hay una cuenta con ese email")).toBeVisible();

    const mail = await waitForMail(email, "Restablece tu contraseña");
    await page.goto(pathOf(mail.link));
    const nueva = "otra frase larga y distinta 2026";
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(nueva);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(page.getByRole("heading", { name: "Contraseña actualizada" })).toBeVisible();

    // El mismo enlace ya no sirve.
    await page.goto(pathOf(mail.link));
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(nueva);
    await page.getByRole("button", { name: "Guardar contraseña" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "El enlace no es válido o ha caducado" }),
    ).toBeVisible();

    await login(page, email, nueva);
    await expect(page.getByRole("heading", { level: 1, name: /Hola, Lucía/ })).toBeVisible();
  });
});

test.describe("equipo, invitaciones y permisos", () => {
  test("el propietario invita; la persona acepta por correo y entra con permisos limitados", async ({
    page,
    browser,
  }) => {
    const owner = await signup(page);
    const verification = await waitForMail(owner.email, "Confirma tu email");
    await page.goto(pathOf(verification.link));
    // Esperar al resultado: navegar antes cancelaría la petición de verificación en curso.
    await expect(page.getByRole("heading", { name: "Email confirmado" })).toBeVisible();
    await page.goto("/team");

    const invitee = `${unique("comercial")}@example.com`;
    await page.getByRole("button", { name: "Invitar a una persona" }).click();
    await page.getByLabel("Email", { exact: true }).fill(invitee);
    await page.getByLabel("Rol").selectOption("sales");
    await page.getByRole("button", { name: "Enviar invitación" }).click();
    await expect(page.getByText("Invitación enviada")).toBeVisible();

    await page.getByRole("tab", { name: "Invitaciones" }).click();
    await expect(page.getByRole("row", { name: new RegExp(invitee) })).toBeVisible();

    // La persona invitada, en otro navegador (sin sesión), acepta desde su correo.
    const mail = await waitForMail(invitee, "te invita a");
    const ctx = await browser.newContext();
    const guest = await ctx.newPage();
    await guest.goto(pathOf(mail.link));
    await guest.getByLabel("Tu nombre").fill("Marcos Comercial");
    await guest.getByLabel("Contraseña", { exact: true }).fill(PASSWORD);
    await guest.getByRole("button", { name: "Unirme al equipo" }).click();
    await expect(guest.getByRole("heading", { level: 1, name: /Hola, Marcos/ })).toBeVisible();
    await expect(guest.getByText("Comercial", { exact: true })).toBeVisible();

    // Comercial: ve el equipo pero NO puede invitar ni ver la actividad ni los ajustes de gestión.
    await guest.goto("/team");
    await expect(guest.getByRole("heading", { level: 1, name: "Equipo" })).toBeVisible();
    await expect(guest.getByRole("button", { name: "Invitar a una persona" })).toBeHidden();
    await expect(guest.getByRole("link", { name: "Actividad" })).toBeHidden();
    await ctx.close();

    // El propietario ve ya al nuevo miembro y puede cambiarle el rol.
    await page.reload();
    await expect(page.getByRole("cell", { name: /Marcos Comercial.*@example\.com/ })).toBeVisible();
  });

  test("el propietario edita los permisos de un rol y el cambio queda guardado", async ({
    page,
  }) => {
    await signup(page);
    await page.goto("/team");
    await page.getByRole("tab", { name: "Permisos" }).click();
    await page.getByLabel("Rol", { exact: true }).selectOption("sales");

    const audit = page.getByLabel("Ver el registro de actividad");
    await expect(audit).not.toBeChecked();
    await audit.check();
    await page.getByRole("button", { name: /Guardar permisos de Comercial/ }).click();
    await expect(page.getByText("Permisos actualizados")).toBeVisible();
    await expect(page.getByText("Personalizado")).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Permisos" }).click();
    await page.getByLabel("Rol", { exact: true }).selectOption("sales");
    await expect(page.getByLabel("Ver el registro de actividad")).toBeChecked();

    // Los permisos del propietario no se pueden editar.
    await page.getByLabel("Rol", { exact: true }).selectOption("owner");
    await expect(page.getByText("Los permisos del propietario no son editables")).toBeVisible();
    await expect(page.getByLabel("Ver el equipo")).toBeDisabled();
  });
});

test.describe("ajustes y actividad", () => {
  test("cambiar el nombre de la empresa y la contraseña; la actividad lo refleja", async ({
    page,
  }) => {
    const { email } = await signup(page);
    await page.goto("/settings");
    const nuevo = `Renombrada ${unique("r")}`;
    await page.getByLabel("Nombre de la empresa").fill(nuevo);
    await page.getByRole("button", { name: "Guardar cambios" }).click();
    await expect(page.getByText("Ajustes guardados")).toBeVisible();

    await page.getByLabel("Contraseña actual").fill(PASSWORD);
    const nueva = "una frase nueva bien larga 2026";
    await page.getByLabel("Nueva contraseña", { exact: true }).fill(nueva);
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(page.getByText("Contraseña actualizada")).toBeVisible();

    await page.goto("/audit");
    await expect(page.getByText("Ajustes de la empresa actualizados")).toBeVisible();
    await expect(page.getByText("Contraseña cambiada")).toBeVisible();
    await expect(page.getByText("Espacio creado")).toBeVisible();

    // Con la nueva contraseña se puede entrar.
    await page.context().clearCookies();
    await login(page, email, nueva);
    await expect(page.getByRole("heading", { level: 1, name: /Hola, Lucía/ })).toBeVisible();
    await expect(page.getByText(nuevo).first()).toBeVisible();
  });
});

test.describe("administración (superadmin)", () => {
  test("login propio, listado, alta manual con email al propietario y suspensión que se refleja en el cliente", async ({
    page,
    browser,
  }) => {
    // Una empresa de autoservicio ya existente.
    const { company } = await signup(page);
    await page.context().clearCookies();

    await page.goto("/admin/login");
    await page.getByLabel("Email", { exact: true }).fill(E2E.adminEmail);
    await page.getByLabel("Contraseña", { exact: true }).fill(E2E.adminPassword);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Empresas" })).toBeVisible();

    // La empresa creada por autoservicio aparece y se puede buscar.
    await page.getByRole("searchbox").fill(company);
    await expect(page.getByRole("button", { name: company })).toBeVisible();

    // Alta manual: el propietario recibe un correo para elegir su contraseña.
    const ownerEmail = `${unique("cliente")}@example.com`;
    const manual = `Manual ${unique("m")}`;
    await page.getByRole("button", { name: "Nueva empresa" }).click();
    await page.getByLabel("Nombre de la empresa").fill(manual);
    await page.getByLabel("Nombre del propietario").fill("Carla Cliente");
    await page.getByLabel("Email del propietario").fill(ownerEmail);
    await page.getByLabel("Días de prueba").fill("0");
    await page.getByRole("button", { name: "Crear empresa" }).click();
    await expect(page.getByText("Empresa creada")).toBeVisible();

    const welcome = await waitForMail(ownerEmail, "está listo");
    const ctx = await browser.newContext();
    const owner = await ctx.newPage();
    await owner.goto(pathOf(welcome.link));
    await expect(
      owner.getByRole("heading", { name: "Te damos la bienvenida a Nexo" }),
    ).toBeVisible();
    await owner.getByLabel("Nueva contraseña", { exact: true }).fill(PASSWORD);
    await owner.getByRole("button", { name: "Guardar contraseña" }).click();
    await login(owner, ownerEmail);
    await expect(owner.getByRole("heading", { level: 1, name: /Hola, Carla/ })).toBeVisible();

    // El superadmin suspende esa empresa con motivo; el cliente lo ve en su cuenta.
    await page.getByRole("searchbox").fill(manual);
    await page.getByRole("button", { name: manual }).click();
    await page.getByLabel("Nuevo estado").selectOption("suspended");
    await page
      .getByLabel("Motivo (queda en la auditoría)")
      .first()
      .fill("Impago de la factura de septiembre");
    await page.getByRole("button", { name: "Aplicar cambio" }).click();
    await expect(page.getByText("Estado actualizado")).toBeVisible();

    await owner.reload();
    await expect(owner.getByText("Esta cuenta está suspendida")).toBeVisible();
    await ctx.close();

    // Auditoría de plataforma.
    await page.getByRole("link", { name: "Auditoría" }).click();
    await expect(page.getByText("tenancy.tenant.status_changed").first()).toBeVisible();
  });

  test("un usuario de tenant no entra al panel de administración", async ({ page }) => {
    await signup(page);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/login/);
  });
});

test.describe("accesibilidad (WCAG AA) y responsive", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`pantallas públicas y privadas sin violaciones · tema ${theme}`, async ({ page }) => {
      await page.goto("/login");
      await setTheme(page, theme);
      await expectAccessible(page);
      await page.goto("/signup");
      await setTheme(page, theme);
      await expectAccessible(page);
      await page.goto("/forgot-password");
      await setTheme(page, theme);
      await expectAccessible(page);

      await signup(page);
      for (const path of ["/", "/team", "/settings", "/audit"]) {
        await page.goto(path);
        await expect(page.getByRole("main")).toBeVisible();
        await page.waitForLoadState("networkidle");
        await setTheme(page, theme);
        await expectAccessible(page);
      }
    });
  }

  test("en móvil la navegación está en un cajón accesible", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signup(page);
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeHidden();
    await page.getByRole("button", { name: "Abrir menú" }).click();
    const nav = page.getByRole("navigation", { name: "Navegación principal" });
    await expect(nav).toBeVisible();
    await nav.getByRole("link", { name: "Equipo" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Equipo" })).toBeVisible();
    // Sin desbordamiento horizontal de la página.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
