import type { Tx } from "../../../platform/db/database";
import { TenantBlockedError, UnauthenticatedError } from "../../../platform/errors";
import type { TenantGate } from "../../../platform/ports";
import type { TenancyService } from "../application/tenancyService";

/**
 * Implementa el puerto `TenantGate` del kernel: ¿puede este tenant operar? Una prueba caducada,
 * un tenant suspendido o cancelado, o un `past_due` fuera de gracia, BLOQUEAN de verdad
 * (ARCHITECTURE §7.2), salvo en rutas marcadas `allowWhenBlocked` (exportar datos, facturación).
 */
export class DbTenantGate implements TenantGate {
  constructor(private readonly service: TenancyService) {}

  async assertCanOperate(
    tx: Tx,
    tenantId: string,
    options: { allowWhenBlocked: boolean },
  ): Promise<void> {
    const state = await this.service.stateFor(tx, tenantId);
    if (!state) throw new UnauthenticatedError("Tenant inexistente");
    if (!state.canOperate && !options.allowWhenBlocked)
      throw new TenantBlockedError(`Tenant ${state.effective}`);
  }
}
