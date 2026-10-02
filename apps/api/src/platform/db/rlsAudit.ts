/**
 * Auditoría de aislamiento multitenant (ARCHITECTURE §5.5, punto 1).
 *
 * Enumera TODAS las tablas del esquema `public` y exige que las que llevan `tenant_id`:
 *  - tengan RLS habilitada y FORZADA,
 *  - tengan la política `tenant_isolation`,
 *  - tengan `tenant_id NOT NULL`,
 *  - tengan un índice con `tenant_id` como primera columna,
 *  - usen FK compuestas (incluyendo `tenant_id`) hacia otras tablas con `tenant_id`.
 * Las tablas SIN `tenant_id` solo se aceptan si están en `GLOBAL_TABLES` (revisada en cada cambio).
 *
 * Se ejecuta en `pnpm db:check-rls` y en `pnpm test:isolation` (bloqueante en CI).
 */
export interface Queryable {
  query<R = unknown>(text: string, params?: unknown[]): Promise<{ rows: R[] }>;
}

export interface GlobalTableRule {
  /** ¿Debe tener RLS habilitada y forzada? (las tablas de identidad internas, no accesibles a `nexo_app`, no). */
  rls: boolean;
}

/**
 * Tablas legítimamente globales (sin `tenant_id`). Añadir una exige justificarlo en el PR.
 * `tenants`: el rol de aplicación solo ve su fila (política `tenant_self`).
 */
export const GLOBAL_TABLES: Readonly<Record<string, GlobalTableRule>> = {
  /** Cada tenant solo ve su fila. */
  tenants: { rls: true },
  /** Identidad global: la app solo ve columnas no sensibles de los miembros de SU tenant. */
  users: { rls: true },
  /** Solo plataforma: `nexo_app` no puede tocarlas (se verifica con privilegios, no con RLS). */
  superadmins: { rls: false },
  refresh_tokens: { rls: false },
  user_tokens: { rls: false },
  platform_audit_log: { rls: false },
};

/** Tablas de auditoría: nadie con rol de aplicación o plataforma puede modificar ni borrar filas. */
export const APPEND_ONLY_TABLES: readonly string[] = ["audit_log", "platform_audit_log"];

export interface RlsViolation {
  table: string;
  rule:
    | "table_without_tenant_id"
    | "rls_not_enabled"
    | "rls_not_forced"
    | "missing_policy"
    | "tenant_id_nullable"
    | "no_tenant_leading_index"
    | "fk_without_tenant_id"
    | "global_table_exposed_to_app"
    | "global_table_missing_policy"
    | "append_only_violated"
    | "role_has_bypassrls";
  detail?: string;
}

export async function auditRls(db: Queryable): Promise<RlsViolation[]> {
  const violations: RlsViolation[] = [];

  const tables = (
    await db.query<{ table: string; has_tenant_id: boolean; rls: boolean; forced: boolean }>(
      `select c.relname as "table",
              exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped) as has_tenant_id,
              c.relrowsecurity as rls,
              c.relforcerowsecurity as forced
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
        order by c.relname`,
    )
  ).rows;

  for (const t of tables) {
    if (!t.has_tenant_id) {
      const rule = GLOBAL_TABLES[t.table];
      if (!rule) {
        violations.push({
          table: t.table,
          rule: "table_without_tenant_id",
          detail: "no está en GLOBAL_TABLES",
        });
        continue;
      }
      if (rule.rls && !t.rls) violations.push({ table: t.table, rule: "rls_not_enabled" });
      if (rule.rls && !t.forced) violations.push({ table: t.table, rule: "rls_not_forced" });
      if (rule.rls) {
        const anyPolicy = await db.query(
          "select 1 from pg_policies where schemaname = 'public' and tablename = $1",
          [t.table],
        );
        if (anyPolicy.rows.length === 0) {
          violations.push({ table: t.table, rule: "global_table_missing_policy" });
        }
      } else {
        // Sin RLS, la protección es NO conceder nada a nexo_app (ni a nivel de tabla ni de columna).
        const exposed = await db.query(
          `select has_any_column_privilege('nexo_app', format('public.%I', $1::text), 'SELECT,INSERT,UPDATE,REFERENCES') as exposed
             where exists (select 1 from pg_roles where rolname = 'nexo_app')`,
          [t.table],
        );
        if (exposed.rows.some((r) => (r as { exposed: boolean }).exposed)) {
          violations.push({ table: t.table, rule: "global_table_exposed_to_app" });
        }
      }
      continue;
    }

    if (!t.rls) violations.push({ table: t.table, rule: "rls_not_enabled" });
    if (!t.forced) violations.push({ table: t.table, rule: "rls_not_forced" });

    const policy = await db.query(
      `select 1 from pg_policies where schemaname = 'public' and tablename = $1 and policyname = 'tenant_isolation'`,
      [t.table],
    );
    if (policy.rows.length === 0) violations.push({ table: t.table, rule: "missing_policy" });

    const nullable = await db.query(
      `select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = $1 and a.attname = 'tenant_id' and not a.attnotnull`,
      [t.table],
    );
    if (nullable.rows.length > 0) violations.push({ table: t.table, rule: "tenant_id_nullable" });

    const leading = await db.query(
      `select 1 from pg_index i
         join pg_class c on c.oid = i.indrelid
         join pg_namespace n on n.oid = c.relnamespace
         join pg_attribute a on a.attrelid = c.oid and a.attnum = i.indkey[0]
        where n.nspname = 'public' and c.relname = $1 and a.attname = 'tenant_id'`,
      [t.table],
    );
    if (leading.rows.length === 0)
      violations.push({ table: t.table, rule: "no_tenant_leading_index" });

    // FK hacia tablas que tienen tenant_id deben incluir tenant_id (FK compuesta).
    const fks = await db.query<{ conname: string }>(
      `select con.conname
         from pg_constraint con
         join pg_class c on c.oid = con.conrelid
         join pg_namespace n on n.oid = c.relnamespace
        where con.contype = 'f' and n.nspname = 'public' and c.relname = $1
          and exists (select 1 from pg_attribute ra where ra.attrelid = con.confrelid and ra.attname = 'tenant_id' and not ra.attisdropped)
          and not exists (select 1 from pg_attribute a where a.attrelid = con.conrelid and a.attname = 'tenant_id' and a.attnum = any (con.conkey))`,
      [t.table],
    );
    for (const fk of fks.rows) {
      violations.push({ table: t.table, rule: "fk_without_tenant_id", detail: fk.conname });
    }
  }

  for (const table of APPEND_ONLY_TABLES) {
    const exists = tables.some((t) => t.table === table);
    if (!exists) continue;
    const mutable = await db.query(
      `select r.rolname
         from pg_roles r
        where r.rolname in ('nexo_app', 'nexo_platform')
          and (has_table_privilege(r.rolname, format('public.%I', $1::text), 'UPDATE')
            or has_table_privilege(r.rolname, format('public.%I', $1::text), 'DELETE'))`,
      [table],
    );
    for (const r of mutable.rows) {
      violations.push({
        table,
        rule: "append_only_violated",
        detail: (r as { rolname: string }).rolname,
      });
    }
  }

  const roles = await db.query<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }>(
    `select rolname, rolbypassrls, rolsuper from pg_roles where rolname = 'nexo_app'`,
  );
  for (const r of roles.rows) {
    if (r.rolbypassrls || r.rolsuper) {
      violations.push({ table: "(rol)", rule: "role_has_bypassrls", detail: r.rolname });
    }
  }

  return violations;
}
