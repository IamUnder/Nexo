# STATUS — Nexo v2

Estado real del proyecto. **Se actualiza en el mismo commit que el cambio que lo modifica** (AGENTS.md, regla de oro 8).

_Última actualización: 2026-10-03 · Fase: **hitos 0, 1 y 3 completados** y panel de ventas (parte del 7). Los hitos 2 (Stripe) y 5 (Google/Microsoft) esperan credenciales externas. **Despliegue y repositorio GitHub: bloqueados por acceso** (ver «Bloqueos»)._

## Hitos

| Hito | Estado | Notas |
|---|---|---|
| Documentación base | ✅ Hecho | `AGENTS.md`, `ARCHITECTURE.md`, `TECH_STACK.md`, `DESIGN_SYSTEM.md`, `MODULES_SPEC.md`. |
| **0 · Cimientos** | ✅ Hecho | Ver detalle abajo. |
| **1 · Platform Core** | ✅ Hecho | Ver detalle abajo. |
| 2 · Entitlements y Billing (Stripe) | ⬜ Pendiente | |
| **3 · CRM** | ✅ Hecho | Ver detalle abajo. |
| **4 · Data Onboarding** | 🟡 Parcial | Hecho: importar empresas y contactos desde CSV (simulación, dedupe, ejecución reanudable, rollback) y exportar a CSV. Pendiente: XLSX, oportunidades, plantillas de mapeo, revisión de coincidencias dudosas. |
| 5 · Comunicación | ⬜ Pendiente | |
| 6 · Delivery Lite | ⬜ Pendiente | |
| 7 · Insights, Onboarding y Demo | 🟡 Parcial | Hecho: panel de ventas (módulo `insights`). Pendiente: asistente de onboarding/plantilla vertical, tenant demo persistente con reset, iconos PNG de la PWA. |
| 8 · API pública y endurecimiento | ⬜ Pendiente | |

## Bloqueos (necesitan al usuario)

1. **Repositorio GitHub privado «Nexo»:** `gh` no está instalado y no hay sesión de GitHub utilizable (el navegador integrado no tiene login). Pasos: crear el repo privado `Nexo` en GitHub y ejecutar `git remote add origin <url> && git push -u origin main` (el historial está listo, Conventional Commits).
2. **Despliegue con Portledger en `nexo.kaizogroup.es`:** la sesión «Portledger» no aparece entre las sesiones alcanzables (`ListAgents`). Todo lo necesario está listo y verificado a mano: `deploy/docker-compose.prod.yml`, `deploy/.env.prod.example`, `docs/runbooks/despliegue.md` y las preguntas de contrato en `docs/runbooks/portledger-preguntas.md`.
3. **SMTP real** para el correo del sistema (obligatorio en producción; sin él nadie confirma el email).
4. Hitos 2 (claves Stripe) y 5 (credenciales Google/Microsoft).

## Hito 3 · qué hay (verificado)

- **Backend `crm`:** empresas, contactos, oportunidades con pipelines configurables (etapas abierta/ganada/perdida, probabilidad), actividad/timeline, tareas y búsqueda global sin tildes (trigram). RLS forzada, FK compuestas, alcance `own`/`all` (lo ajeno responde 404), siguiente acción obligatoria, motivo de pérdida, importe de oportunidad cerrada protegido, eventos de dominio (`crm.deal.won` con contactos para Delivery). Pipeline por defecto al nacer el tenant (evento + creación perezosa).
- **Web:** tablero con arrastre y menú accesible «Mover a…», ficha de oportunidad (ganar/perder/reabrir, edición, tareas, timeline), empresas (lista, ficha, contactos, oportunidades), contactos, «Mis tareas», búsqueda global en la barra superior; i18n es/en.
- **Insights (panel de ventas, parte del hito 7):** read models por eventos, conciliación con el CRM verificada por test, alcance `own`/`all`, panel en Inicio con pipeline, ponderado, conversión, ciclo medio, ingresos ganados, previsión, actividad y motivos de pérdida.
- **Tests:** API 203 (23 de integración CRM + 7 de Insights), E2E del flujo comercial completo con axe en claro/oscuro.
- **Datos de ejemplo** (onboarding minuto 0): `POST/DELETE /crm/sample-data` (8 empresas, 10 oportunidades en todas las etapas, tareas y timeline) con los casos de uso reales; solo quita lo marcado como ejemplo. Botones en el tablero.
- **Pendiente del CRM:** editor de pipeline en Ajustes (la API ya existe: `PUT /crm/pipelines/:id/stages`), exportación CSV, importación (hito 4).

## Hito 4 (parcial) · qué hay (verificado)

- **Backend `data-import`:** lote con simulación fiel (no escribe), normalización (NIF, teléfono, dominio, nombre completo), dedupe contra el CRM y dentro del fichero, política omitir/completar, ejecución asíncrona con checkpoint por fila, rollback en 30 días (avisa de lo que el usuario ya usó), exportación CSV para Excel (`;` + BOM). El CRM se conecta por el puerto `ImportTarget` (sin imports entre módulos).
- **Web:** asistente «Importar» (lectura del CSV en el navegador con detección de `;`/Windows-1252, mapeo sugerido, vista previa, simulación, progreso, errores descargables, historial y deshacer) y exportación.
- **Tests:** API 234 en total (12 de integración de importación), web 22, E2E del flujo completo con axe.

## Hallazgos de los hitos 3 y despliegue

1. `ALTER ROLE` de la migración 0000 exigía `CREATEROLE` (el propietario no lo tiene en producción) → ahora condicional.
2. Los errores 4xx de Fastify (cuerpo vacío, JSON mal formado) se devolvían como 500 → corregido con test.
3. `.partial()` de Zod conserva los `.default()` → un PATCH habría pisado el estado con el valor por defecto; los esquemas de actualización ya no los llevan.
4. **MinIO ya no publica imágenes** → SeaweedFS (ADR 0003). Las URLs prefirmadas necesitan un endpoint público (`S3_PUBLIC_ENDPOINT`).
5. Los subselects correlacionados de Drizzle (`${tabla.col}` dentro de `sql`) se resolvían contra la tabla interna → contadores a 0; se califican con el nombre de tabla.

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
- Sin remoto Git configurado: el CI de GitHub no ha corrido todavía (ver «Bloqueos»).
