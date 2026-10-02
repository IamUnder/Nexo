-- Migración 0000 · Roles, extensiones y helpers de RLS (ARCHITECTURE §5.2).
--
-- Roles de base de datos:
--   nexo_owner    propietario del esquema y de las migraciones (el que ejecuta este fichero).
--   nexo_app      pool de aplicación. SIN BYPASSRLS: la RLS SIEMPRE aplica.
--   nexo_platform pool de plataforma. BYPASSRLS, DML acotado (login, webhooks, outbox, superadmin).
--
-- Si el rol propietario no puede crear roles (PaaS sin CREATEROLE), un administrador debe crear
-- `nexo_app` y `nexo_platform` una vez (docs/runbooks/db-roles.md) y esta migración solo los verifica.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_app') THEN
    BEGIN
      CREATE ROLE nexo_app LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'No se puede crear el rol nexo_app: créalo con un administrador (ver docs/runbooks/db-roles.md)';
    END;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexo_platform') THEN
    BEGIN
      CREATE ROLE nexo_platform LOGIN NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE;
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE EXCEPTION 'No se puede crear el rol nexo_platform: créalo con un administrador (ver docs/runbooks/db-roles.md)';
    END;
  END IF;
END
$$;
--> statement-breakpoint

-- Garantías de seguridad de los roles (idempotente): nexo_app jamás puede saltarse la RLS.
ALTER ROLE nexo_app NOSUPERUSER NOBYPASSRLS;
--> statement-breakpoint

CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- Tenant activo de la transacción actual. Lo fija `Database.withTenant()` con
-- set_config('app.tenant_id', ..., is_local => true). Sin contexto devuelve NULL, y comparar con
-- NULL no devuelve ni escribe filas: la RLS falla de forma SEGURA.
CREATE OR REPLACE FUNCTION nexo_current_tenant() RETURNS uuid
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
--> statement-breakpoint

-- Helper de migración: habilita y FUERZA la RLS de una tabla con `tenant_id`, crea la política
-- estándar `tenant_isolation` y concede DML a los roles de aplicación y plataforma.
-- Se usa SIEMPRE así en las migraciones de módulos:   SELECT nexo_enable_tenant_rls('crm_deals');
-- Nunca se escribe la política a mano (el meta-test de aislamiento exige exactamente este patrón).
CREATE OR REPLACE FUNCTION nexo_enable_tenant_rls(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', tbl);  -- aplica también al propietario
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s USING (tenant_id = nexo_current_tenant()) WITH CHECK (tenant_id = nexo_current_tenant())',
    tbl
  );
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO nexo_app, nexo_platform', tbl);
END
$$;
