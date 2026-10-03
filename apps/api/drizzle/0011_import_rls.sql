-- Migración 0011 · RLS de Data Onboarding (hito 4).

SELECT nexo_enable_tenant_rls('import_batches');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('import_rows');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('import_items');
