import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it } from "vitest";
import { HomePage } from "./HomePage";
import { createI18n } from "./i18n";
import { applyTheme, useTheme } from "./theme";

function renderHome(lng = "es") {
  return render(
    <I18nextProvider i18n={createI18n(lng)}>
      <HomePage />
    </I18nextProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useTheme.setState({ theme: "light" });
  applyTheme("light");
});

describe("HomePage", () => {
  it("muestra los textos en español por defecto", () => {
    renderHome();
    expect(screen.getByRole("heading", { level: 1, name: "Bienvenido a Nexo" })).toBeTruthy();
  });

  it("está preparada para otros idiomas (i18n)", () => {
    renderHome("en");
    expect(screen.getByRole("heading", { level: 1, name: "Welcome to Nexo" })).toBeTruthy();
  });

  it("alterna el tema, lo aplica al documento y lo persiste", async () => {
    renderHome();
    await userEvent.click(screen.getByRole("button", { name: "Cambiar a tema oscuro" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("nexo.theme")).toBe("dark");
    expect(screen.getByRole("button", { name: "Cambiar a tema claro" })).toBeTruthy();
  });

  it("sigue funcionando si localStorage no está disponible", async () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("bloqueado");
    };
    try {
      renderHome();
      await userEvent.click(screen.getByRole("button", { name: "Cambiar a tema oscuro" }));
      expect(document.documentElement.dataset.theme).toBe("dark");
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
