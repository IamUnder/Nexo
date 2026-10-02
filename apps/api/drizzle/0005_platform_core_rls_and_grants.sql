-- Migración 0005 · RLS y permisos de identity, tenancy, audit y files (hito 1).

-- ── Tablas de TENANT: RLS forzada con el helper oficial ─────────────────────────────────────
SELECT nexo_enable_tenant_rls('memberships');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('invitations');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('role_permission_overrides');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('tenant_settings');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('audit_log');
--> statement-breakpoint
SELECT nexo_enable_tenant_rls('files');
--> statement-breakpoint

-- La auditoría es inmutable desde la aplicación: solo INSERT y SELECT.
REVOKE UPDATE, DELETE ON audit_log FROM nexo_app, nexo_platform;
--> statement-breakpoint

-- ── users: identidad global con visibilidad acotada para la aplicación ──────────────────────
-- nexo_app solo ve a los usuarios con membresía en SU tenant, y solo columnas no sensibles
-- (password_hash, failed_logins y locked_until NO se conceden). Alta, login y cambios los hace
-- el módulo identity con el pool de plataforma.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE users FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY member_visibility ON users FOR SELECT TO nexo_app
  USING (EXISTS (
    SELECT 1 FROM memberships m
     WHERE m.user_id = users.id AND m.tenant_id = nexo_current_tenant()
  ));
--> statement-breakpoint
GRANT SELECT (id, email, full_name, locale, status, email_verified_at, created_at) ON users TO nexo_app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON users TO nexo_platform;
--> statement-breakpoint

-- ── Tablas GLOBALES solo de plataforma: nexo_app no tiene NINGÚN privilegio ──────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON superadmins TO nexo_platform;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO nexo_platform;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON user_tokens TO nexo_platform;
--> statement-breakpoint
-- Auditoría de plataforma: inmutable (solo INSERT y SELECT).
GRANT SELECT, INSERT ON platform_audit_log TO nexo_platform;
