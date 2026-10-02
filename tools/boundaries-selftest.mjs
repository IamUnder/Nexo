// Autotest de las reglas de dependencia: crea módulos de ejemplo que las INCUMPLEN y comprueba
// que dependency-cruiser los detecta. Así sabemos que `check:boundaries` no «pasa en falso».
// Uso: node tools/boundaries-selftest.mjs   (también en CI)
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const { cruise } = await import("dependency-cruiser");
const config = require("../.dependency-cruiser.cjs");

const root = process.cwd();
const modulesDir = join(root, "apps/api/src/modules");
const files = {
  // crm importa delivery → viola modules-are-isolated
  "zz_crm/index.ts": 'import "../zz_delivery/index";\nexport const a = 1;\n',
  "zz_delivery/index.ts": "export const b = 2;\n",
  // módulo de negocio usando el pool de plataforma
  "crm/index.ts": 'import "../../platform/db/platform";\nexport const c = 3;\n',
  // domain importando infrastructure
  "zz_domain/domain/x.ts": 'import "../infrastructure/y";\nexport const d = 4;\n',
  "zz_domain/infrastructure/y.ts": "export const e = 5;\n",
  // application importando http
  "zz_app/application/u.ts": 'import "../http/r";\nexport const f = 6;\n',
  "zz_app/http/r.ts": "export const g = 7;\n",
};

const created = [];
try {
  for (const [rel, content] of Object.entries(files)) {
    const full = join(modulesDir, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content);
    created.push(rel.split("/")[0]);
  }
  const result = await cruise(
    ["apps/api/src/modules"],
    {
      ruleSet: config,
      validate: true,
      tsPreCompilationDeps: true,
      exclude: config.options.exclude,
    },
    { tsConfig: "tsconfig.base.json" },
  );
  const names = new Set(result.output.summary.violations.map((v) => v.rule.name));
  const expected = [
    "modules-are-isolated",
    "no-platform-db-from-business",
    "domain-is-pure",
    "application-does-not-know-adapters",
  ];
  const missing = expected.filter((n) => !names.has(n));
  if (missing.length > 0) {
    console.error(`Autotest FALLIDO: no se detectaron las reglas: ${missing.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log(`Autotest OK: se detectan las ${expected.length} violaciones de ejemplo.`);
  }
} finally {
  for (const dir of new Set(created))
    rmSync(join(modulesDir, dir), { recursive: true, force: true });
}
