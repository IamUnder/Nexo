/**
 * `pnpm db:seed:demo`: crea (si no existe) el tenant demo con datos ficticios del vertical «Servicios
 * profesionales». Idempotente y sin datos reales. Requiere DEMO_ADMIN_EMAIL y DEMO_ADMIN_PASSWORD.
 */
import { ensureDemoTenant, loadDemoData, openDemoRuntime } from "./lib/demo";

const rt = openDemoRuntime();
try {
  const ctx = await ensureDemoTenant(rt);
  const result = await loadDemoData(rt, ctx, false);
  console.log(
    `demo listo: ${result.accounts} empresas, ${result.contacts} contactos, ${result.deals} oportunidades`,
  );
} finally {
  await rt.close();
}
