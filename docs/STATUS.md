# STATUS — Nexo v2

Estado real del proyecto. **Se actualiza en el mismo commit que el cambio que lo modifica** (AGENTS.md, regla de oro 8).

_Última actualización: 2026-10-03 · Fase: **hitos 0 y 1 completados**; siguiente: hito 3 (CRM). Los hitos 2 (Stripe) y 5 (Google/Microsoft) esperan credenciales externas._

## Hitos

| Hito | Estado | Notas |
|---|---|---|
| Documentación base | ✅ Hecho | `AGENTS.md`, `ARCHITECTURE.md`, `TECH_STACK.md`, `DESIGN_SYSTEM.md`, `MODULES_SPEC.md`. |
| **0 · Cimientos** | ✅ Hecho | Ver detalle abajo. |
| **1 · Platform Core** | ✅ Hecho | Ver detalle abajo. |
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

## Hito 1 · qué hay (verificado)

- **Identidad:** usuarios globales con membresías por tenant, login con bloqueo progresivo (5 fallos → 15 min, duplicando), selección de empresa, sesión con access token de 15 min en memoria + refresh rotado en cookie `httpOnly`/`SameSite=Strict` con detección de reutilización (ADR 0002), recuperación y cambio de contraseña, verificación de email, invitaciones, roles predefinidos y **matriz de permisos editable por tenant**, asientos Full/Light.
- **Tenancy:** alta self-service (prueba de 21 días) y alta manual por superadmin, estados con bloqueo real por prueba caducada, ajustes del tenant, ampliar prueba, suspender/reactivar con motivo auditado.
- **Superadmin:** sesión, cookie y token propios (ámbito `platform`); panel con empresas, alta manual, detalle y auditoría de plataforma.
- **Archivos** (subida/descarga por URL firmada, claves fijadas por el servidor, cuota), **auditoría** inmutable, **outbox + worker (pg-boss)** con suscriptor de correos de bienvenida/verificación.
- **Web:** login, alta, recuperación, verificación, aceptar invitación, selector de empresa, inicio, equipo (miembros, invitaciones, permisos), ajustes, actividad y panel de administración; i18n es/en; tema claro/oscuro; responsive con cajón móvil; accesibilidad AA.
- **Tests:** API 160 (incl. 45 de integración HTTP del Platform Core + 26 de aislamiento + dispatcher), UI 17, web 13, contracts 5, design-tokens 30; **11 E2E** con la pila real (PostgreSQL + Mailpit + api + worker + navegador) y axe en ambos temas.
- **Entitlements provisionales:** hasta el hito 2 todo tenant tiene los módulos Core activos y sin límite de asientos (`apps/api/src/composition/localEntitlements.ts`).

## Hallazgos del hito 1

1. **La rotación estricta de refresh tokens cerraba la sesión al recargar** durante una renovación (carrera). Tolerancia de 10 s (ADR 0002).
2. **i18next trata `:` como separador de namespace:** las etiquetas de permisos (`identity:member:read`) salían sin traducir; ahora las claves usan `_`.
3. El arnés E2E reveló además un falso positivo de axe por transiciones de color (se espera a que terminen) y un asterisco de «obligatorio» dentro de la etiqueta (ahora es CSS).

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
