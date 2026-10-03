-- Migración 0015 · RLS de Onboarding (hito 7).

SELECT nexo_enable_tenant_rls('onboarding_progress');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('onboarding_milestones');
