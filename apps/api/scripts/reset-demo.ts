/**
 * `pnpm db:reset:demo`: devuelve el tenant demo a su estado inicial (quita y vuelve a cargar los datos
 * de ejemplo) sin tocar las credenciales de su admin. Requiere DEMO_ADMIN_EMAIL y DEMO_ADMIN_PASSWORD.
 */
import { ensureDemoTenant, loadDemoData, openDemoRuntime } from "./lib/demo";

const rt = openDemoRuntime();
try {
  const ctx = await ensureDemoTenant(rt);
  const result = await loadDemoData(rt, ctx, true);
  console.log(
    `demo reseteado: ${result.accounts} empresas, ${result.contacts} contactos, ${result.deals} oportunidades`,
  );
} finally {
  await rt.close();
}
