-- Migración 0009 · RLS de los read models de Insights (hito 7).

SELECT nexo_enable_tenant_rls('insights_deal_facts');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('insights_stage_history');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('insights_activity_daily');
