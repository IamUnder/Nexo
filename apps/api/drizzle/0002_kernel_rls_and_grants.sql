-- Migración 0002 · RLS y permisos de las tablas del kernel.
-- Toda tabla con tenant_id usa `nexo_enable_tenant_rls()` (definida en 0000); nunca políticas a mano.

GRANT USAGE ON SCHEMA public TO nexo_app, nexo_platform;
--> statement-breakpoint

SELECT nexo_enable_tenant_rls('outbox_events');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('processed_events');
--> statement-breakpoint

-- `tenants` no tiene `tenant_id` (su clave es `id`). El rol de aplicación solo puede LEER su propia
-- fila; crear, modificar y listar tenants es cosa de la plataforma (nexo_platform, BYPASSRLS).
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_self ON tenants FOR SELECT TO nexo_app USING (id = nexo_current_tenant());
--> statement-breakpoint
GRANT SELECT ON tenants TO nexo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON tenants TO nexo_platform;
