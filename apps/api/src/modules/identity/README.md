# Módulo `identity` (plataforma)

## Qué hace
Usuarios globales con membresías por tenant, login con bloqueo progresivo, sesión (access JWT 15 min + refresh rotado en cookie `httpOnly`; ADR 0002), recuperación y verificación de email, invitaciones, roles, matriz de permisos editable por tenant, asientos Full/Light y sesión del superadmin (ámbito `platform`).

## Entitlement
Siempre activo.

## Tablas
`users`, `memberships`, `invitations`, `refresh_tokens`, `user_tokens` (verificación y recuperación), `role_permission_overrides`, `superadmins` (ver `infrastructure/schema.ts`).

## Eventos
- **Emite:** `identity.membership.created|updated|removed`.
- **Consume:** `tenancy.tenant.created` (correos de bienvenida y verificación).

## Puertos
- **Declara:** `TenantDirectory` (resumen de tenants), `SeatLimit`, `ActiveModules`, correo y auditoría del kernel.
- **Implementa:** `PermissionResolver`, `TokenService`, `directory` (nombres/pertenencia de miembros para otros módulos), propietarios y sesiones para `tenancy`.

## Permisos
`identity:member:read|manage`, `identity:role:manage`.

## Cómo probarlo
`pnpm --filter @nexo/api test -- identity` y `src/composition/platformCore.int.test.ts`.

## Reglas de aislamiento
No importa ningún otro módulo. `tenancy` e `identity` se necesitan mutuamente solo a través de puertos cableados en `composition/`.
