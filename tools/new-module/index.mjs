// `pnpm module:new <nombre>`: genera el esqueleto de un módulo de backend con la estructura y las
// reglas de ARCHITECTURE §3 (capas, README, puertos, eventos). Uso: pnpm module:new crm
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2];
if (!name || !/^[a-z][a-z-]{1,30}$/.test(name)) {
  console.error("Uso: pnpm module:new <nombre-en-kebab-case>   (ej. crm, data-import)");
  process.exit(2);
}

const dir = join(process.cwd(), "apps/api/src/modules", name);
if (existsSync(dir)) {
  console.error(`El módulo «${name}» ya existe en ${dir}`);
  process.exit(1);
}

const prefix = name.replace(/-/g, "_");
const pascal = name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());

const files = {
  "README.md": `# Módulo \`${name}\`

> Completa este README al implementar el módulo (AGENTS.md §6). Referencia: MODULES_SPEC.md.

## Qué hace
_Una frase._

## Entitlement
\`module:${prefix}\` _(o «siempre» si es de plataforma)_

## Tablas (prefijo \`${prefix}_\`)
_Lista de tablas. Toda tabla con \`tenant_id\` usa \`select nexo_enable_tenant_rls('<tabla>')\` en su migración._

## Eventos
- **Emite:** _(esquemas en \`@nexo/contracts/events\`)_
- **Consume:**

## Puertos
- **Declara (necesita de fuera):** _(en \`ports/\`)_
- **Implementa (ofrece a otros):**

## Permisos
_\`${prefix}:<recurso>:<acción>\`_

## Cómo probarlo
\`pnpm --filter @nexo/api test -- ${name}\`

## Reglas de aislamiento
Este módulo **no importa** ningún otro módulo (\`pnpm check:boundaries\`). Habla con el resto por eventos, puertos o slots de UI.
`,
  "index.ts": `/**
 * ÚNICA superficie pública del módulo \`${name}\` (ARCHITECTURE §3).
 * Los demás módulos NO importan de aquí: solo \`apps/api/src/composition/\` lo registra.
 */
export {};
`,
  "domain/.gitkeep": "",
  "application/.gitkeep": "",
  "ports/.gitkeep": "",
  "infrastructure/schema.ts": `// Esquema Drizzle del módulo \`${name}\`. Prefijo de tabla: \`${prefix}_\`.
// Reglas (ARCHITECTURE §5.2): tenant_id not null → FK a tenants, unique (tenant_id, id), RLS con
// nexo_enable_tenant_rls() en la migración, índices con tenant_id líder, FK compuestas internas.
export {};
`,
  "http/.gitkeep": "",
  "events/.gitkeep": "",
  "jobs/.gitkeep": "",
  [`__tests__/${name}.test.ts`]: `import { describe, it } from "vitest";

describe("${pascal}", () => {
  it.todo("cubre los criterios de aceptación de MODULES_SPEC.md");
});
`,
};

for (const [rel, content] of Object.entries(files)) {
  const full = join(dir, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content);
}
console.log(`Módulo «${name}» creado en apps/api/src/modules/${name}`);
console.log(
  "Siguiente: añade su entrada al catálogo de módulos, sus permisos en @nexo/contracts y regístralo en composition/.",
);
