import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

async function a11yViolations(container: HTMLElement) {
  // jsdom no calcula estilos reales: el contraste se valida con el test de tokens (design-tokens).
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations;
}

describe("Button", () => {
  it("renderiza la etiqueta y dispara onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Crear oportunidad</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Crear oportunidad" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("tiene type=button por defecto (no envía formularios sin querer)", () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole("button").getAttribute("type")).toBe("button");
  });

  it("deshabilitado: no dispara onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Guardar
      </Button>,
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("cargando: marca aria-busy, conserva la etiqueta accesible e ignora clics", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Guardar
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Guardar" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("usa solo tokens semánticos: ninguna clase con HEX", () => {
    render(<Button variant="secondary">Cancelar</Button>);
    expect(screen.getByRole("button").className).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it.each(["primary", "secondary", "ghost"] as const)(
    "%s: sin violaciones de accesibilidad",
    async (variant) => {
      const { container } = render(<Button variant={variant}>Acción</Button>);
      expect(await a11yViolations(container)).toEqual([]);
    },
  );
});
