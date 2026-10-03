-- Migración 0007 · RLS e índices de búsqueda del CRM (hito 3).

SELECT nexo_enable_tenant_rls('crm_accounts');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('crm_contacts');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('crm_pipelines');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('crm_pipeline_stages');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('crm_deals');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('crm_activities');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('crm_tasks');
--> statement-breakpoint

-- Búsqueda global tolerante a erratas y tildes (pg_trgm + unaccent). `unaccent` no es IMMUTABLE, así
-- que se envuelve en una función propia para poder indexarla.
CREATE OR REPLACE FUNCTION nexo_unaccent(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT public.unaccent('public.unaccent', $1)
$$;
--> statement-breakpoint
CREATE INDEX crm_accounts_name_trgm_idx ON crm_accounts USING gin (nexo_unaccent(lower(name)) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX crm_contacts_name_trgm_idx ON crm_contacts USING gin (nexo_unaccent(lower(first_name || ' ' || coalesce(last_name, ''))) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX crm_contacts_email_trgm_idx ON crm_contacts USING gin (lower(email) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX crm_deals_name_trgm_idx ON crm_deals USING gin (nexo_unaccent(lower(name)) gin_trgm_ops);
