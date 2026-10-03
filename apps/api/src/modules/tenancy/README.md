# Módulo `tenancy` (plataforma)

## Qué hace
Alta self-service (prueba de 21 días) y manual por superadmin, ciclo de vida del tenant (`trial`, `active`, `past_due`, `suspended`, `cancelled`) con el bloqueo real que aplican los guards, ajustes del tenant y operaciones de plataforma (ampliar prueba, suspender/reactivar con motivo).

## Entitlement
Siempre activo.

## Tablas
`tenants`, `tenant_settings` (ver `platform/db/schema.ts`; `tenants` es global y está en la lista de tablas globales del meta-test `auditRls`).

## Eventos
- **Emite:** `tenancy.tenant.created`, `tenancy.tenant.status_changed`.
- **Consume:** ninguno.

## Puertos
- **Declara:** propietarios, sesiones y miembros (los aporta `identity`).
- **Implementa:** `TenantGate` (estado del tenant para los guards) y resúmenes de tenants.

## Permisos
`tenancy:settings:read|manage`; la operación de plataforma exige sesión de superadmin.

## Cómo probarlo
`pnpm --filter @nexo/api test -- tenancy` y `src/composition/platformCore.int.test.ts`.

## Reglas de aislamiento
No importa ningún otro módulo.
