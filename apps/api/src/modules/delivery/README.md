# Módulo `delivery` (Delivery Lite)

## Qué hace
Elimina el corte entre venta y ejecución: un deal ganado crea un proyecto con plantilla (hitos y tareas por defecto), y el equipo gestiona tareas, hitos, estado/salud y tiempo. Referencia: MODULES_SPEC §5.

## Entitlement
`module:delivery` (Core).

## Tablas (prefijo `delivery_`)
`delivery_projects` (cuenta y deal de origen como `uuid` sin FK + `account_name` snapshot; índice único parcial `(tenant_id, source_deal_id)` → idempotencia), `delivery_milestones`, `delivery_tasks`, `delivery_time_entries`. FK compuestas dentro del módulo; RLS forzada (`0013`).

## Eventos
- **Emite:** `delivery.project.created|updated|status_changed|completed`, `delivery.task.created|completed`, `delivery.time.logged`.
- **Consume:** `crm.deal.won` (crea el proyecto, una sola vez por deal), `crm.account.updated` (sincroniza el nombre), `crm.account.deleted` (marca `account_archived`).

## Puertos
- **Declara:** `MemberDirectory` (nombres y pertenencia de miembros; lo implementa `identity` vía `composition/`).

## Permisos
`delivery:project:read|create|update|delete`, `delivery:task:read|create|update|delete`, `delivery:time:read|create`. Comerciales y solo lectura: leer; operaciones: trabajar (tareas y tiempo) y crear/editar proyectos; manager/admin: todo. El alcance `own` no restringe (los proyectos son del equipo).

## Reglas
- Salud automática y explicable: tarea bloqueada → `off_track` (proyecto `blocked`); tarea vencida → `at_risk`. Se recalcula al tocar tareas y, al leer, las vencidas ponen en riesgo un proyecto activo.
- Un proyecto `planned`, `done` o `cancelled` no cambia solo de estado.
- Un hito o tarea de otro proyecto no se puede mezclar.

## Pendiente
Plantillas editables por tenant y desactivar la creación automática (`deal_won_creates_project`), comentarios, miembros de proyecto, restricciones de asiento Light y botón «Crear ahora» ante fallo del handler.

## Cómo probarlo
`pnpm --filter @nexo/api test -- delivery` (reglas + 10 de integración con PostgreSQL real).

## Reglas de aislamiento
No importa ningún otro módulo (`pnpm check:boundaries`). La ficha de empresa muestra sus proyectos mediante un hueco que rellena el router.
