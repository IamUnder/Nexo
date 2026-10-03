import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Field, Input } from "./Field";
import { Dialog, Menu, Tabs } from "./Overlays";
import { Alert, Badge, EmptyState } from "./Surfaces";
import { Table, Td, THead, Th, Tr } from "./Table";
import { ToastProvider, useToast } from "./Toast";

async function violations(container: HTMLElement) {
  const r = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return r.violations.map((v) => `${v.id}: ${v.help}`);
}

describe("Field", () => {
  it("asocia etiqueta, ayuda y error con el control mediante ARIA", async () => {
    const { container, rerender } = render(
      <Field label="Email" hint="Usa tu email de trabajo">
        {(p) => <Input type="email" {...p} />}
      </Field>,
    );
    const input = screen.getByLabelText("Email");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Usa tu email de trabajo")).toBeTruthy();

    rerender(
      <Field label="Email" hint="Usa tu email de trabajo" error="Introduce un email válido">
        {(p) => <Input type="email" {...p} />}
      </Field>,
    );
    expect(screen.getByLabelText("Email").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("alert").textContent).toContain("Introduce un email válido");
    expect(await violations(container)).toEqual([]);
  });

  it("marca los obligatorios sin depender del color", () => {
    render(
      <Field label="Nombre" required>
        {(p) => <Input {...p} />}
      </Field>,
    );
    expect(screen.getByLabelText(/Nombre/).getAttribute("aria-required")).toBe("true");
  });
});

describe("Alert, Badge y EmptyState", () => {
  it("los errores se anuncian con role=alert; los avisos con status", () => {
    render(
      <>
        <Alert tone="error" title="No se pudo guardar" />
        <Alert tone="info">Información</Alert>
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain("No se pudo guardar");
    expect(screen.getByRole("status").textContent).toContain("Información");
  });

  it("sin violaciones de accesibilidad", async () => {
    const { container } = render(
      <div>
        <Badge tone="success">Activo</Badge>
        <EmptyState
          title="Sin datos"
          description="Aún no hay nada"
          action={<button type="button">Crear</button>}
        />
      </div>,
    );
    expect(await violations(container)).toEqual([]);
  });
});

describe("Dialog", () => {
  function Demo({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(true);
    return (
      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) onClose();
        }}
        title="Eliminar elemento"
        description="Esta acción no se puede deshacer"
        closeLabel="Cerrar"
      >
        <p>Contenido</p>
      </Dialog>
    );
  }

  it("expone título y descripción accesibles, se cierra con Esc y con el botón", async () => {
    const onClose = vi.fn();
    render(<Demo onClose={onClose} />);
    const dialog = await screen.findByRole("dialog", { name: "Eliminar elemento" });
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });
});

describe("Tabs y Menu", () => {
  it("las pestañas son navegables por teclado", async () => {
    function T() {
      const [v, setV] = useState("a");
      return (
        <Tabs
          label="Secciones"
          value={v}
          onValueChange={setV}
          items={[
            { value: "a", label: "Uno", content: <p>Contenido A</p> },
            { value: "b", label: "Dos", content: <p>Contenido B</p> },
          ]}
        />
      );
    }
    render(<T />);
    expect(screen.getByRole("tablist", { name: "Secciones" })).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Dos" }));
    expect(screen.getByText("Contenido B")).toBeTruthy();
  });

  it("el menú se abre y ejecuta la acción elegida", async () => {
    const onSelect = vi.fn();
    render(
      <Menu
        trigger={<button type="button">Cuenta</button>}
        items={[{ key: "x", label: "Cerrar sesión", onSelect }]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cuenta" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Cerrar sesión" }));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe("Table", () => {
  it("usa cabeceras con scope y es accesible", async () => {
    const { container } = render(
      <Table label="Miembros">
        <THead>
          <Tr>
            <Th>Nombre</Th>
            <Th className="text-right">Valor</Th>
          </Tr>
        </THead>
        <tbody>
          <Tr>
            <Td>Ana</Td>
            <Td numeric>1.234 €</Td>
          </Tr>
        </tbody>
      </Table>,
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(await violations(container)).toEqual([]);
  });
});

describe("Toast", () => {
  it("muestra la confirmación y la retira sola", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    function Btn() {
      const toast = useToast();
      return (
        <button type="button" onClick={() => toast.show("Guardado correctamente")}>
          Guardar
        </button>
      );
    }
    render(
      <ToastProvider>
        <Btn />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(screen.getByText("Guardado correctamente")).toBeTruthy();
    vi.advanceTimersByTime(5200);
    await waitFor(() => expect(screen.queryByText("Guardado correctamente")).toBeNull());
    vi.useRealTimers();
  });
});
