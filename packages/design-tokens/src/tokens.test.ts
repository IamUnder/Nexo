import { describe, expect, it } from "vitest";
import { contrastRatio, semanticTokens } from "./index";

type Theme = keyof typeof semanticTokens;
const themes: Theme[] = ["light", "dark"];

/** Pares (texto, fondo) que deben cumplir un mínimo WCAG (DESIGN_SYSTEM.md §4). */
const textPairs: Array<[string, string, number]> = [
  ["color-text-primary", "color-surface-default", 7],
  ["color-text-primary", "color-bg-canvas", 7],
  ["color-text-secondary", "color-surface-default", 4.5],
  ["color-text-secondary", "color-bg-canvas", 4.5],
  ["color-action-primary-fg", "color-action-primary-bg", 7],
  ["color-action-primary-fg", "color-action-primary-bg-hover", 4.5],
  ["color-success-fg", "color-success-bg", 4.5],
  ["color-warning-fg", "color-warning-bg", 4.5],
  ["color-error-fg", "color-error-bg", 4.5],
  ["color-info-fg", "color-info-bg", 4.5],
];

/** Componentes UI (foco, controles): ≥ 3:1. */
const uiPairs: Array<[string, string, number]> = [
  ["color-focus-ring", "color-surface-default", 3],
  ["color-focus-ring", "color-bg-canvas", 3],
  ["color-action-primary-bg", "color-surface-default", 3],
];

describe.each(themes)("contraste WCAG · tema %s", (theme) => {
  const t = semanticTokens[theme] as Record<string, string>;
  it.each(textPairs)("%s sobre %s ≥ %s:1", (fg, bg, min) => {
    expect(contrastRatio(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(min);
  });
  it.each(uiPairs)("%s sobre %s ≥ %s:1", (fg, bg, min) => {
    expect(contrastRatio(t[fg] as string, t[bg] as string)).toBeGreaterThanOrEqual(min);
  });
});

/**
 * HALLAZGO (e2e con axe): `color.text.muted` del manual NO alcanza AA para texto pequeño
 * (Light 3,84:1 sobre canvas; Dark ≈ 5:1). Se conserva el color oficial, pero su uso queda
 * restringido (DESIGN_SYSTEM §4): solo texto grande (≥ 18 px o 14 px negrita), iconos o ayuda NO
 * esencial. El texto informativo pequeño usa `text.secondary`. Este test fija el suelo de 3:1.
 */
describe.each(themes)("text.muted · suelo de 3:1 · tema %s", (theme) => {
  it("cumple al menos 3:1 sobre canvas y superficie", () => {
    const t = semanticTokens[theme] as Record<string, string>;
    expect(
      contrastRatio(t["color-text-muted"] as string, t["color-bg-canvas"] as string),
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(t["color-text-muted"] as string, t["color-surface-default"] as string),
    ).toBeGreaterThanOrEqual(3);
  });
});

describe("estructura de tokens", () => {
  it("Light y Dark definen exactamente las mismas claves", () => {
    expect(Object.keys(semanticTokens.dark).sort()).toEqual(
      Object.keys(semanticTokens.light).sort(),
    );
  });
  it("todos los valores semánticos son HEX válidos", () => {
    for (const theme of themes)
      for (const v of Object.values(semanticTokens[theme])) expect(v).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
