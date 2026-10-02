import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { assertValidTenantId, type TenantContext } from "../tenant/context";
import { type Schema, schema } from "./schema";

export type Db = NodePgDatabase<Schema>;
/** Transacción de Drizzle. Solo se obtiene a través de `withTenant` / `withPlatform`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface DatabaseOptions {
  /** Rol `nexo_app` (sin BYPASSRLS): todo el código de negocio. */
  appUrl: string;
  /** Rol `nexo_platform` (BYPASSRLS): solo módulos autorizados (ARCHITECTURE §5.3). */
  platformUrl: string;
  maxConnections?: number;
}

/**
 * Punto único de acceso a PostgreSQL.
 *
 * SEGURIDAD: los pools son privados. La ÚNICA forma de obtener una transacción de negocio es
 * `withTenant()`, que fija el contexto de tenant que la RLS usa para filtrar. El acceso al pool de
 * plataforma (BYPASSRLS) vive en `./platform.ts` y `dependency-cruiser` impide que los módulos de
 * negocio lo importen.
 */
export class Database {
  private readonly appPool: Pool;
  private readonly platformPool: Pool;
  private readonly appDb: Db;
  private readonly platformDb: Db;

  constructor(options: DatabaseOptions) {
    const max = options.maxConnections ?? 10;
    this.appPool = new Pool({ connectionString: options.appUrl, max });
    this.platformPool = new Pool({
      connectionString: options.platformUrl,
      max: Math.max(2, Math.floor(max / 2)),
    });
    this.appDb = drizzle(this.appPool, { schema });
    this.platformDb = drizzle(this.platformPool, { schema });
  }

  /**
   * Ejecuta `fn` en una transacción con el contexto de tenant fijado.
   *
   * `set_config(..., is_local = true)` equivale a `SET LOCAL`: el valor muere al terminar la
   * transacción, por lo que NO puede filtrarse a otra petición que reutilice la conexión del pool.
   * No se usan `SET` de sesión ni `search_path`. Compatible con poolers en modo transacción.
   */
  async withTenant<T>(
    ctx: Pick<TenantContext, "tenantId">,
    fn: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    assertValidTenantId(ctx.tenantId);
    return this.appDb.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${ctx.tenantId}, true)`);
      return fn(tx);
    });
  }

  /** @internal Solo para `./platform.ts`. No usar desde módulos de negocio. */
  _platformTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.platformDb.transaction(fn);
  }

  /** @internal Comprobación de vida del pool de aplicación (readiness). */
  async ping(): Promise<void> {
    await this.appPool.query("select 1");
  }

  async close(): Promise<void> {
    await Promise.all([this.appPool.end(), this.platformPool.end()]);
  }
}
