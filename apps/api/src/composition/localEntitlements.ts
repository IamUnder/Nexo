import { CORE_MODULE_KEYS } from "@nexo/contracts";
import type { Tx } from "../platform/db/database";
import type { EntitlementProvider } from "../platform/ports";

/**
 * ENTITLEMENTS PROVISIONALES (hasta el hito 2: Stripe y catálogo).
 *
 * Mientras no exista facturación, todo tenant tiene contratados TODOS los módulos Core, sin límite de
 * asientos y con el almacenamiento por defecto del catálogo (50 GB). Está aislado en este fichero a
 * propósito: el hito 2 lo sustituye por la lectura de la tabla `entitlements` (Stripe ∪ overrides ∪
 * prueba) sin tocar ningún módulo, porque todos consumen los puertos del kernel.
 */
export const DEFAULT_STORAGE_LIMIT_BYTES = 50 * 1024 ** 3;

export class LocalEntitlements implements EntitlementProvider {
  async has(_tx: Tx, _tenantId: string, key: string): Promise<boolean> {
    if (key.startsWith("module:")) {
      return (CORE_MODULE_KEYS as readonly string[]).includes(key.slice("module:".length));
    }
    return true;
  }

  async activeModules(_tx: Tx, _tenantId: string): Promise<string[]> {
    return [...CORE_MODULE_KEYS];
  }

  async seatLimit(): Promise<number | null> {
    return null;
  }

  async storageLimitBytes(): Promise<number | null> {
    return DEFAULT_STORAGE_LIMIT_BYTES;
  }
}
