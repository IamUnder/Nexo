-- Migración 0013 · RLS de Delivery Lite (hito 6).

SELECT nexo_enable_tenant_rls('delivery_projects');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('delivery_milestones');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('delivery_tasks');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('delivery_time_entries');
