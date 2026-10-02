import { z } from "zod";
import type { Database, Tx } from "../db/database";
import { systemContext, type TenantContext } from "../tenant/context";

/**
 * Definición de un job con contexto de tenant OBLIGATORIO (ARCHITECTURE §5.4 y §9.5).
 * Un job sin `tenantId` válido en el payload es un error: no hay jobs "sin dueño" de negocio.
 * (Los jobs globales de plataforma — caducidad de pruebas, conciliación de Stripe — se definen
 * aparte y usan `withPlatform`.)
 */
export interface TenantJobDefinition<TPayload extends { tenantId: string }> {
  name: string;
  payloadSchema: z.ZodType<TPayload>;
  /** Ejecuta el job con el contexto de tenant ya fijado en una transacción. */
  run(args: { tx: Tx; ctx: TenantContext; payload: TPayload }): Promise<void>;
}

export interface TenantJob<TPayload extends { tenantId: string }> {
  name: string;
  /** Valida el payload y ejecuta dentro de `withTenant`. */
  handle(database: Database, rawPayload: unknown): Promise<void>;
  /** Esquema para validar al encolar. */
  payloadSchema: z.ZodType<TPayload>;
}

export function defineTenantJob<TPayload extends { tenantId: string }>(
  def: TenantJobDefinition<TPayload>,
): TenantJob<TPayload> {
  return {
    name: def.name,
    payloadSchema: def.payloadSchema,
    async handle(database, rawPayload) {
      const payload = def.payloadSchema.parse(rawPayload);
      z.string().uuid().parse(payload.tenantId);
      const ctx = systemContext(payload.tenantId);
      await database.withTenant(ctx, (tx) => def.run({ tx, ctx, payload }));
    },
  };
}
