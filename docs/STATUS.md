# STATUS — Nexo v2

Estado real del proyecto. **Se actualiza en el mismo commit que el cambio que lo modifica** (AGENTS.md, regla de oro 8).

_Última actualización: 2026-10-03 · Fase: **hito 0 completado**; siguiente: hito 1 (Platform Core)._

## Hitos

| Hito | Estado | Notas |
|---|---|---|
| Documentación base | ✅ Hecho | `AGENTS.md`, `ARCHITECTURE.md`, `TECH_STACK.md`, `DESIGN_SYSTEM.md`, `MODULES_SPEC.md`. |
| **0 · Cimientos** | ✅ Hecho | Ver detalle abajo. |
| 1 · Platform Core (identidad, alta self-service/manual, superadmin, outbox/worker, archivos) | ⬜ Pendiente | La base (RLS, `withTenant`, outbox, roles de BD) ya está del hito 0. |
| 2 · Entitlements y Billing (Stripe) | ⬜ Pendiente | |
| 3 · CRM | ⬜ Pendiente | |
| 4 · Data Onboarding | ⬜ Pendiente | |
| 5 · Comunicación | ⬜ Pendiente | |
| 6 · Delivery Lite | ⬜ Pendiente | |
| 7 · Insights, Onboarding y Demo | ⬜ Pendiente | Aquí también: iconos PNG de la PWA, tenant demo. |
| 8 · API pública y endurecimiento | ⬜ Pendiente | |

## Hito 0 · qué hay (verificado)

- **Monorepo** pnpm 12 + Turborepo; Biome (lint+format); TypeScript 6 estricto; hooks lefthook (Conventional Commits).
- **Kernel de BD** (`apps/api/src/platform/db`): tres roles (`nexo_owner`/`nexo_app`/`nexo_platform`), RLS forzada vía `nexo_enable_tenant_rls()`, `Database.withTenant()` (único acceso de negocio), pool de plataforma aislado en `platform.ts`, outbox (`publishEvent`) e idempotencia (`processed_events`), `defineTenantJob`, `TenantResolver` (session + subdomain preparado), errores con códigos estables, logger con redacción, config validada con Zod, app Fastify base (helmet, CORS, rate limit, `/healthz`, `/readyz`).
- **Migraciones** Drizzle (`apps/api/drizzle`) + runner `migrate` verificado contra PostgreSQL real.
- **Aislamiento**: meta-test `auditRls` (+ `pnpm db:check-rls`) y matriz de acceso cruzado entre tenants (15 tests, bloqueante).
- **Fronteras entre módulos**: `dependency-cruiser` (13 reglas) + autotest que prueba que detecta violaciones.
- **Design system**: tokens JSON → CSS/Tailwind generados, 30 comprobaciones de contraste WCAG, `@nexo/ui` (Button, Icon), Storybook 10.
- **Web**: Vite 8 + React 19 + Tailwind 4 + TanStack Router/Query + i18n (es/en) + tema claro/oscuro + PWA; e2e Playwright con axe (AA) en ambos temas.
- **Herramientas**: `pnpm module:new`, `check:i18n`, `infra:up` (Docker/Podman).
- **Contenedores**: `docker/Dockerfile.api` y `Dockerfile.web` construidos y arrancados con Podman; `dist/migrate.js` + `dist/api.js` probados contra Postgres 18 real.
- **CI** (`.github/workflows`): estático, tests (unit+integración+aislamiento), build (imágenes sin publicar), e2e, seguridad semanal. _Aún no ejecutado en GitHub: el repositorio no tiene remoto._
- **Tests**: 106 (contracts 5 · design-tokens 30 · ui 8 · web 4 · api 59) + 3 e2e.

## Hallazgos del hito 0

1. **TypeScript 7 incompatible con dependency-cruiser** → `check:boundaries` pasaba en falso. Fijado TS 6 (ADR 0001) + autotest.
2. **`color.text.muted` del manual no cumple AA** para texto pequeño en Light (3,84:1). Uso restringido y documentado (DESIGN_SYSTEM §4); decisión pendiente con el diseño definitivo.
3. **Testcontainers + Podman**: la espera por puerto interno se cuelga; se usa espera por log (TECH_STACK §4).
4. **Portledger no contactable** por mensajería: OD-05 sigue abierta (`docs/runbooks/portledger-preguntas.md`).

## Pendiente / decisiones abiertas

Ver ARCHITECTURE.md §17.2 (OD-01 … OD-08) y los hallazgos anteriores.

## Notas

- v1 (`../CRM`) es solo referencia de aprendizaje; no se copia código sin revisarlo.
- Sin remoto Git configurado: el CI de GitHub no ha corrido todavía.
