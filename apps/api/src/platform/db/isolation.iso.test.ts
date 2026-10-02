import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type MigratedDb, setupMigratedDb } from "../../testing/migratedDb";
import type { Database } from "./database";
import { withPlatform } from "./platform";
import { auditRls } from "./rlsAudit";
import { tenants } from "./schema";

/**
 * MATRIZ DE AISLAMIENTO MULTITENANT (ARCHITECTURE §5.5). Bloquea el CI.
 * Usa una tabla `tenant_probe` creada con el helper oficial `nexo_enable_tenant_rls`, igual que
 * lo harán los módulos. Cuando existan módulos reales, esta matriz se amplía por cada recurso de la
 * API (leer/actualizar/borrar/listar/buscar/exportar con usuario y con API key).
 */
let env: MigratedDb;
let db: Database;
let A: string;
let B: string;
let probeA: string;

beforeAll(async () => {
  env = await setupMigratedDb();
  db = env.database();
  const ids = await withPlatform(db, "test: crear tenants", (tx) =>
    tx
      .insert(tenants)
      .values([
        { slug: "tenant-a", name: "Tenant A" },
        { slug: "tenant-b", name: "Tenant B" },
      ])
      .returning({ id: tenants.id, slug: tenants.slug }),
  );
  A = ids.find((t) => t.slug === "tenant-a")?.id as string;
  B = ids.find((t) => t.slug === "tenant-b")?.id as string;

  await env.raw.ownerPool.query(`
    create table tenant_probe (
      id uuid primary key default uuidv7(),
      tenant_id uuid not null references tenants(id),
      value text not null,
      unique (tenant_id, id)
    );
    create index tenant_probe_tenant_idx on tenant_probe (tenant_id);
    select nexo_enable_tenant_rls('tenant_probe');
  `);
  await db.withTenant({ tenantId: A }, async (tx) => {
    await tx.execute(sql`insert into tenant_probe (tenant_id, value) values (${A}, 'secreto-A')`);
  });
  await db.withTenant({ tenantId: B }, async (tx) => {
    await tx.execute(sql`insert into tenant_probe (tenant_id, value) values (${B}, 'secreto-B')`);
  });
  const row = await db.withTenant({ tenantId: A }, (tx) =>
    tx.execute(sql`select id from tenant_probe`),
  );
  probeA = row.rows[0]?.id as string;
});

afterAll(async () => {
  await env?.stop();
});

/**
 * Drizzle envuelve los errores de PostgreSQL ("Failed query: ..."): el mensaje real está en `cause`.
 * Comprobamos SIEMPRE el motivo real (RLS / permisos), no solo que "algo falle".
 */
async function expectPgError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e as { message: string; cause?: { message?: string } },
  );
  expect(error, "se esperaba un error de PostgreSQL").not.toBeNull();
  expect(`${error?.cause?.message ?? ""} ${error?.message ?? ""}`).toMatch(pattern);
}

const values = async (tenantId: string) =>
  (
    await db.withTenant({ tenantId }, (tx) =>
      tx.execute(sql`select value from tenant_probe order by value`),
    )
  ).rows.map((r) => r.value);

describe("meta-test de cobertura RLS (auditRls)", () => {
  it("el esquema real (kernel + probe) cumple todas las reglas", async () => {
    expect(await auditRls(env.raw.ownerPool)).toEqual([]);
  });

  it("detecta una tabla con tenant_id sin RLS ni política", async () => {
    await env.raw.ownerPool.query(
      "create table bad_no_rls (tenant_id uuid not null references tenants(id), id uuid primary key default uuidv7()); create index on bad_no_rls (tenant_id)",
    );
    try {
      const rules = (await auditRls(env.raw.ownerPool))
        .filter((v) => v.table === "bad_no_rls")
        .map((v) => v.rule);
      expect(rules).toEqual(
        expect.arrayContaining(["rls_not_enabled", "rls_not_forced", "missing_policy"]),
      );
    } finally {
      await env.raw.ownerPool.query("drop table bad_no_rls");
    }
  });

  it("detecta una tabla sin tenant_id que no está en GLOBAL_TABLES", async () => {
    await env.raw.ownerPool.query("create table bad_global (id uuid primary key)");
    try {
      const v = (await auditRls(env.raw.ownerPool)).filter((x) => x.table === "bad_global");
      expect(v.map((x) => x.rule)).toContain("table_without_tenant_id");
    } finally {
      await env.raw.ownerPool.query("drop table bad_global");
    }
  });

  it("detecta tenant_id nullable, sin índice líder y FK no compuesta", async () => {
    await env.raw.ownerPool.query(`
      create table bad_shape (
        id uuid primary key default uuidv7(),
        tenant_id uuid references tenants(id),
        probe_id uuid references tenant_probe(id)
      );
      select nexo_enable_tenant_rls('bad_shape');
    `);
    try {
      const rules = (await auditRls(env.raw.ownerPool))
        .filter((v) => v.table === "bad_shape")
        .map((v) => v.rule);
      expect(rules).toEqual(
        expect.arrayContaining([
          "tenant_id_nullable",
          "no_tenant_leading_index",
          "fk_without_tenant_id",
        ]),
      );
    } finally {
      await env.raw.ownerPool.query("drop table bad_shape");
    }
  });
});

describe("matriz de acceso cruzado entre tenants", () => {
  it("cada tenant ve solo sus filas", async () => {
    expect(await values(A)).toEqual(["secreto-A"]);
    expect(await values(B)).toEqual(["secreto-B"]);
  });

  it("A no puede LEER la fila de B por id, ni por filtro, ni por búsqueda", async () => {
    const foreignId = (
      await db.withTenant({ tenantId: B }, (tx) => tx.execute(sql`select id from tenant_probe`))
    ).rows[0]?.id as string;
    const byId = await db.withTenant({ tenantId: A }, (tx) =>
      tx.execute(sql`select * from tenant_probe where id = ${foreignId}`),
    );
    const byFilter = await db.withTenant({ tenantId: A }, (tx) =>
      tx.execute(sql`select * from tenant_probe where tenant_id = ${B}`),
    );
    const bySearch = await db.withTenant({ tenantId: A }, (tx) =>
      tx.execute(sql`select * from tenant_probe where value ilike '%secreto-B%'`),
    );
    expect(byId.rows).toHaveLength(0);
    expect(byFilter.rows).toHaveLength(0);
    expect(bySearch.rows).toHaveLength(0);
  });

  it("A no puede ACTUALIZAR ni BORRAR filas de B (0 filas afectadas)", async () => {
    const upd = await db.withTenant({ tenantId: A }, (tx) =>
      tx.execute(sql`update tenant_probe set value = 'hackeado' where tenant_id = ${B}`),
    );
    const del = await db.withTenant({ tenantId: A }, (tx) =>
      tx.execute(sql`delete from tenant_probe where tenant_id = ${B}`),
    );
    expect(upd.rowCount).toBe(0);
    expect(del.rowCount).toBe(0);
    expect(await values(B)).toEqual(["secreto-B"]);
  });

  it("A no puede INSERTAR una fila a nombre de B (WITH CHECK)", async () => {
    await expectPgError(
      db.withTenant({ tenantId: A }, (tx) =>
        tx.execute(sql`insert into tenant_probe (tenant_id, value) values (${B}, 'intruso')`),
      ),
      /row-level security/i,
    );
  });

  it("A no puede MOVER su fila a B cambiando tenant_id (WITH CHECK en UPDATE)", async () => {
    await expectPgError(
      db.withTenant({ tenantId: A }, (tx) =>
        tx.execute(sql`update tenant_probe set tenant_id = ${B} where id = ${probeA}`),
      ),
      /row-level security/i,
    );
    expect(await values(A)).toEqual(["secreto-A"]);
  });

  it("20 peticiones concurrentes alternando tenants solo ven sus datos", async () => {
    const small = env.database({ maxConnections: 4 });
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => {
        const t = i % 2 === 0 ? A : B;
        return small
          .withTenant({ tenantId: t }, (tx) => tx.execute(sql`select value from tenant_probe`))
          .then((r) => ({ t, vals: r.rows.map((x) => x.value) }));
      }),
    );
    for (const r of results) expect(r.vals).toEqual([r.t === A ? "secreto-A" : "secreto-B"]);
  });
});

describe("contexto ausente y rol de aplicación", () => {
  it("sin contexto de tenant, nexo_app no ve filas ni puede escribir (fallo seguro)", async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: env.raw.appUrl, max: 1 });
    try {
      const read = await pool.query("select * from tenant_probe");
      expect(read.rows).toHaveLength(0);
      await expect(
        pool.query("insert into tenant_probe (tenant_id, value) values ($1, 'x')", [A]),
      ).rejects.toThrow(/row-level security/i);
    } finally {
      await pool.end();
    }
  });

  it("nexo_app no puede desactivar la RLS ni cambiar políticas (no es propietario)", async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: env.raw.appUrl, max: 1 });
    try {
      await expect(
        pool.query("alter table tenant_probe disable row level security"),
      ).rejects.toThrow();
      await expect(pool.query("drop policy tenant_isolation on tenant_probe")).rejects.toThrow();
      await expect(pool.query("set role nexo_platform")).rejects.toThrow();
    } finally {
      await pool.end();
    }
  });

  it("la tabla tenants: nexo_app solo ve SU fila y no puede modificarla", async () => {
    const own = await db.withTenant({ tenantId: A }, (tx) =>
      tx.execute(sql`select slug from tenants`),
    );
    expect(own.rows.map((r) => r.slug)).toEqual(["tenant-a"]);
    await expectPgError(
      db.withTenant({ tenantId: A }, (tx) =>
        tx.execute(sql`update tenants set name = 'x' where id = ${A}`),
      ),
      /permission denied/i,
    );
    await expectPgError(
      db.withTenant({ tenantId: A }, (tx) =>
        tx.execute(sql`insert into tenants (slug, name) values ('nuevo', 'Nuevo')`),
      ),
      /permission denied/i,
    );
  });

  it("un tenant inexistente no ve nada", async () => {
    expect(await values(randomUUID())).toEqual([]);
  });
});

describe("pool de plataforma (BYPASSRLS)", () => {
  it("ve todos los tenants y puede gestionarlos", async () => {
    const all = await withPlatform(db, "test: listar tenants", (tx) => tx.select().from(tenants));
    expect(all.map((t) => t.slug).sort()).toEqual(expect.arrayContaining(["tenant-a", "tenant-b"]));
  });
});
