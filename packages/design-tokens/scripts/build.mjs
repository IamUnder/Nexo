// Genera dist/tokens.css y dist/tailwind-theme.css a partir de tokens.json (DESIGN_SYSTEM.md §10).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tokens = JSON.parse(readFileSync(join(root, "tokens.json"), "utf8"));
const out = join(root, "dist");
mkdirSync(out, { recursive: true });

const decl = (obj, prefix = "nexo", indent = "  ") =>
  Object.entries(obj)
    .map(([k, v]) => `${indent}--${prefix}-${k}: ${v};`)
    .join("\n");

const flatten = (obj, path = []) =>
  Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "object" ? flatten(v, [...path, k]) : [[[...path, k].join("-"), v]],
  );

const primitives = flatten(tokens.primitives)
  .map(([k, v]) => `  --nexo-${k}: ${v};`)
  .join("\n");

const css = `/* GENERADO por scripts/build.mjs — no editar a mano. Fuente: tokens.json */
:root {
${primitives}
${decl(tokens.semantic.light)}
${decl(tokens.shadows.light, "nexo-shadow")}
  color-scheme: light;
}
:root[data-theme="light"] {
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
${decl(tokens.semantic.dark, "nexo", "    ")}
${decl(tokens.shadows.dark, "nexo-shadow", "    ")}
    color-scheme: dark;
  }
}
:root[data-theme="dark"] {
${decl(tokens.semantic.dark)}
${decl(tokens.shadows.dark, "nexo-shadow")}
  color-scheme: dark;
}
`;
writeFileSync(join(out, "tokens.css"), css);

// Tema Tailwind 4: expone SOLO tokens semánticos (los primitivos no son utilidades).
// Nombres de utilidad legibles: bg-canvas, bg-surface, text-primary, border-line, bg-action-primary…
export function tailwindName(token) {
  const t = token.replace(/^color-/, "");
  const map = {
    "bg-canvas": "canvas",
    "surface-default": "surface",
    "border-default": "line",
    "divider-subtle": "divider",
    "text-primary": "primary",
    "text-secondary": "secondary",
    "text-muted": "muted",
    "focus-ring": "focus",
    "action-primary-bg": "action-primary",
    "action-primary-fg": "action-primary-fg",
    "action-primary-bg-hover": "action-primary-hover",
    "action-primary-bg-active": "action-primary-active",
    "action-primary-bg-disabled": "action-primary-disabled",
    "selection-tint": "selection",
    "accent-signal": "signal",
  };
  if (map[t]) return map[t];
  const state = /^(success|warning|error|info)-(fg|bg)$/.exec(t);
  if (state) return state[2] === "fg" ? state[1] : `${state[1]}-bg`;
  return t; // surface-raised, surface-hover…
}

const names = Object.keys(tokens.semantic.light).map((k) => [k, tailwindName(k)]);
if (new Set(names.map(([, n]) => n)).size !== names.length) {
  throw new Error("design-tokens: nombres de utilidad Tailwind duplicados");
}
const sem = names.map(([k, n]) => `  --color-${n}: var(--nexo-${k});`).join("\n");
writeFileSync(
  join(out, "tailwind-theme.css"),
  `/* GENERADO — no editar. */
@theme inline {
${sem}
  --font-sans: var(--nexo-font-body);
  --font-display: var(--nexo-font-display);
  --radius-control: var(--nexo-radius-control);
  --radius-card: var(--nexo-radius-card);
  --radius-modal: var(--nexo-radius-modal);
  --radius-chip: var(--nexo-radius-chip);
  --shadow-elevation-1: var(--nexo-shadow-elevation-1);
  --shadow-elevation-2: var(--nexo-shadow-elevation-2);
}
`,
);
console.log("design-tokens: generado dist/tokens.css y dist/tailwind-theme.css");
