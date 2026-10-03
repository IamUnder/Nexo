# Módulo `audit` (plataforma)

## Qué hace
Registro **inmutable** (append-only) de acciones de seguridad y de negocio, y su consulta paginada. Implementa el puerto `AuditLogger` del kernel que usan todos los módulos.

## Entitlement
Siempre activo.

## Tablas
`audit_log` (tenant) y `platform_audit_log` (acciones del superadmin). Sin `UPDATE`/`DELETE` para `nexo_app` (lo comprueba `auditRls`).

## Eventos
Ninguno.

## Puertos
- **Implementa:** `AuditLogger` (`record(tx, ctx, entry)`), dentro de la transacción del caso de uso que audita.

## Permisos
`audit:log:read`.

## Cómo probarlo
`pnpm --filter @nexo/api test -- audit` y `src/composition/platformCore.int.test.ts`.

## Reglas de aislamiento
No importa ningún otro módulo.
