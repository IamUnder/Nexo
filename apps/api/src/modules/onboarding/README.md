# Módulo `onboarding`

## Qué hace
Checklist de activación visible en Inicio: refleja lo que de verdad ha pasado, es descartable y retomable, y cada paso lleva a la pantalla real. Referencia: MODULES_SPEC §8.

## Entitlement
Siempre activo (es parte del producto base).

## Tablas (prefijo `onboarding_`)
`onboarding_progress` (por tenant: descartado, fecha de activación, registros importados e invitados acumulados) y `onboarding_milestones` (hito + fecha, uno por tenant). RLS forzada (`0015`).

## Eventos
- **Emite:** ninguno.
- **Consume:** `crm.deal.created|stage_changed` → `deal_created_or_moved`; `import.batch.completed` → suma registros (≥ 50 → `import_50_records`); `identity.membership.created` (al aceptar una invitación) → suma invitados (≥ 3 → `invited_3_users`); `delivery.project.created` con `sourceDealId` → `project_from_deal`.

## Puertos
Ninguno: no lee tablas de otros módulos.

## Permisos
`onboarding:checklist:read` (todos los roles) y `onboarding:checklist:manage` (ocultar/mostrar; manager, admin y owner).

## Reglas
- **Activación** = todos los pasos disponibles cumplidos. El paso de buzón/calendario existe pero figura «Próximamente» y no cuenta hasta que exista el módulo de comunicación.
- Los hitos son idempotentes. Solo cuentan los eventos posteriores a la existencia del módulo (no hay _backfill_ para tenants anteriores).

## Pendiente
Asistente de plantilla vertical y sub-plantillas, checklist por vertical (`onboarding_checklist_templates`), señales PQL para el superadmin y calculadora de coste (con billing).

## Demo
`pnpm db:seed:demo` y `pnpm db:reset:demo` (ver `docs/runbooks/despliegue.md`): tenant «Nexo Demo» activo sin caducidad con los datos de ejemplo.

## Cómo probarlo
`pnpm --filter @nexo/api test -- onboarding` (reglas + 6 de integración con eventos reales).

## Reglas de aislamiento
No importa ningún otro módulo (`pnpm check:boundaries`).
