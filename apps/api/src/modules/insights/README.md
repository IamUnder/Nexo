# Módulo `insights`

## Qué hace
Panel de ventas (pipeline, ponderado, conversión, ciclo medio, ingresos ganados, previsión, actividad, motivos de pérdida) calculado sobre **read models alimentados por eventos**. Referencia: MODULES_SPEC §7.

## Entitlement
`module:insights` (Core).

## Tablas (prefijo `insights_`)
`insights_deal_facts` (estado completo de cada oportunidad; el evento más antiguo no pisa al más nuevo), `insights_stage_history` (transiciones, idempotente por id de evento), `insights_activity_daily` (contadores por día/tipo/autor). RLS forzada (`0009`). Sin FK hacia otros módulos.

## Eventos
- **Emite:** ninguno.
- **Consume:** `crm.deal.created|updated|stage_changed|won|lost|deleted`, `crm.activity.logged`. Un suscriptor (cola) por evento.

## Puertos
Ninguno: no consulta tablas de otros módulos.

## Permisos
`insights:dashboard:read`. Con alcance `own` solo se calculan las métricas propias (el parámetro `ownerId` se ignora); con `all` se puede filtrar por propietario.

## Pendiente
Proyectos en riesgo (necesita `delivery`), adopción de la cuenta, instantáneas diarias, exportación CSV y _backfill_ al activar el módulo (MODULES_SPEC §7.2-7.3).

## Cómo probarlo
`pnpm --filter @nexo/api test -- insights` (conciliación con el CRM, idempotencia, alcance y aislamiento).

## Reglas de aislamiento
No importa ningún otro módulo (`pnpm check:boundaries`).
