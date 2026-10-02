import type { Database, Tx } from "./database";

/**
 * ACCESO CON BYPASSRLS. Úsese solo cuando el trabajo es legítimamente transversal a tenants:
 * login (buscar membresías de un email), webhooks de Stripe, dispatcher del outbox, panel de
 * superadmin y jobs globales (ARCHITECTURE §5.3).
 *
 * Reglas (verificadas por `dependency-cruiser`, regla `no-platform-db-from-business`):
 *  - Solo pueden importar este fichero `identity`, `tenancy`, `billing`, `audit` y el dispatcher.
 *  - Cuando el trabajo real afecta a datos de UN tenant, entra en `database.withTenant(...)`
 *    en vez de seguir con este acceso.
 *
 * `reason` queda en el código a propósito: obliga a quien llama a justificar por qué evita la RLS.
 */
export function withPlatform<T>(
  database: Database,
  _reason: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return database._platformTransaction(fn);
}
