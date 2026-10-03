# Módulo `crm`

## Qué hace
Empresas, contactos, oportunidades (pipelines configurables), actividad (timeline) y tareas. Referencia: MODULES_SPEC §3.

## Entitlement
`module:crm` (Core).

## Tablas (prefijo `crm_`)
`crm_accounts`, `crm_contacts`, `crm_pipelines`, `crm_pipeline_stages`, `crm_deals`, `crm_activities`, `crm_tasks`. Todas con `tenant_id`, RLS forzada (`0007`), FK compuestas `(tenant_id, id)`, borrado lógico en empresas/contactos/oportunidades e índices trigram + `nexo_unaccent()` para búsqueda sin tildes.

## Eventos
- **Emite** (`@nexo/contracts/events`): `crm.account.*`, `crm.contact.*`, `crm.deal.created|updated|stage_changed|won|lost|deleted`, `crm.task.created|completed`, `crm.activity.logged`.
- **Consume:** `tenancy.tenant.created` → crea el pipeline por defecto (`crm.default_pipeline`; además se crea de forma perezosa si aún no existe).

## Puertos
- **Declara:** `MemberDirectory` (nombres y pertenencia de miembros; lo implementa `identity` vía `composition/`).
- **Implementa:** ninguno.

## Permisos
`crm:account|contact|deal|task|activity:read|create|update|delete`, `crm:account:export`, `crm:deal:manage` (editar el importe de una oportunidad cerrada), `crm:pipeline:manage`. Alcance `own` (solo registros propios; lo ajeno responde 404) o `all`.

## Reglas de negocio
- Toda oportunidad abierta exige **siguiente acción** (texto o fecha).
- Perder exige **motivo**; una oportunidad cerrada no se mueve, se reabre.
- No se borra una empresa con oportunidades abiertas ni una etapa con oportunidades.
- Un pipeline tiene al menos una etapa abierta, una ganada y una perdida, sin nombres repetidos.

## Cómo probarlo
`pnpm --filter @nexo/api test -- crm` (unitarios de dominio + 25 de integración HTTP con PostgreSQL real).

## Reglas de aislamiento
No importa ningún otro módulo (`pnpm check:boundaries`). Habla con el resto por eventos y puertos.
