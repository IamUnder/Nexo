import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Stack, startStack } from "./stack";

const here = dirname(fileURLToPath(import.meta.url));
let stack: Stack | undefined;

/** Arranca la pila real una vez para toda la ejecución y guarda la URL de Mailpit para los tests. */
export default async function globalSetup() {
  stack = await startStack();
  writeFileSync(join(here, ".mailpit-url"), stack.mailpitApi);
  return async () => {
    await stack?.stop();
  };
}
