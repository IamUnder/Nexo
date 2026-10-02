// `pnpm infra:up` / `pnpm infra:down`: levanta o para la infraestructura local (docker-compose.yml)
// con Docker o, si no existe, con Podman.
import { spawnSync } from "node:child_process";

const action = process.argv[2];
if (!["up", "down"].includes(action)) {
  console.error("Uso: node tools/infra.mjs <up|down>");
  process.exit(2);
}

const args = action === "up" ? ["compose", "up", "-d", "--wait"] : ["compose", "down"];

function has(cmd) {
  return spawnSync(cmd, ["--version"], { stdio: "ignore", shell: true }).status === 0;
}

const runtime = ["docker", "podman"].find(has);
if (!runtime) {
  console.error(
    "No se encontró Docker ni Podman. Instala uno de los dos para usar la infraestructura local.",
  );
  process.exit(1);
}

const result = spawnSync(runtime, args, { stdio: "inherit", shell: true });
if (result.status !== 0 && runtime === "podman") {
  console.error(
    "\n`podman compose` necesita un proveedor (docker-compose o podman-compose) y la VM arrancada (`podman machine start`).",
  );
}
process.exit(result.status ?? 1);
