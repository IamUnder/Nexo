// Compila los entry points (api, worker, migrate, seed) a ESM en dist/ con esbuild.
// Las dependencias de npm quedan como imports externos (se instalan en la imagen); los paquetes del
// workspace (@nexo/*) se incluyen en el bundle porque exportan TypeScript, no JavaScript compilado.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const external = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(
  (name) => !name.startsWith("@nexo/"),
);

await build({
  entryPoints: {
    api: "src/api.ts",
    worker: "src/worker.ts",
    migrate: "src/migrate.ts",
    seed: "scripts/seed.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  external,
  logLevel: "info",
});
