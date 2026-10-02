# AGENTS.md — Nexo

> Fuente de verdad para cualquier agente de IA (Claude Code, Cursor, Windsurf, Devin…) que trabaje en este repositorio.
> Léelo entero antes de tocar código. Si algo de aquí choca con lo que te pide una tarea, **para y pregunta**.

**Nexo** es un CRM operativo modular (SaaS B2B multitenant) para pymes de servicios B2B (10-75 empleados, España primero, UE después). Promesa: _«del lead al trabajo entregado»_. Se vende por usuarios y módulos (Stripe Billing).

Este repositorio es la **v2 desde cero**. El proyecto `CRM` (v1) fue una prueba de concepto: se aprende de él pero **no se copia código sin revisarlo**. Las lecciones de v1 están en [ARCHITECTURE.md §1.2](ARCHITECTURE.md).

## 1. Mapa de documentación

| Fichero | Para qué sirve |
|---|---|
| `AGENTS.md` (este) | Reglas, autonomía, comandos, Git, definición de «hecho». |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Arquitectura, multitenancy (RLS), eventos, seguridad, despliegue, decisiones. |
| [`TECH_STACK.md`](TECH_STACK.md) | Stack exacto con versiones y estructura del monorepo. |
| [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) | Tokens, tipografía, componentes y reglas de UI. |
| [`MODULES_SPEC.md`](MODULES_SPEC.md) | Qué hace cada módulo, entidades, DTOs, eventos, entitlements y facturación. |
| `docs/Nexo_Estrategia_Producto_MVP_GTM.pdf` | Estrategia de producto (origen del alcance). |
| `docs/Nexo_Sistema_Identidad_UIUX_v1.pptx` | Manual de identidad visual (origen del design system). |
| `docs/adr/NNNN-titulo.md` | Decisiones nuevas tomadas durante el desarrollo (ver §8). |
| `docs/STATUS.md` | Estado real del proyecto: qué está hecho, qué falta. **Mantenlo al día.** |

Orden de precedencia si hay conflicto: instrucciones directas del usuario en la conversación → `AGENTS.md` → `ARCHITECTURE.md` → resto de documentos → PDF/PPTX.

## 2. Reglas de oro (no negociables)

1. **Aislamiento entre tenants es el riesgo existencial.** Toda tabla de negocio lleva `tenant_id`, tiene RLS activada y forzada, y se accede **solo** mediante `withTenant()`. Prohibido saltarse RLS en código de módulos de negocio. Un test automático falla si una tabla nueva no cumple (ver ARCHITECTURE §5).
2. **Los módulos están aislados.** Un módulo solo puede depender de `platform/` (núcleo compartido), de `@nexo/contracts` y de los puertos que él mismo declare. **No se importan módulos entre sí.** Se comunican por eventos (outbox) o por puertos cableados en la composición. `pnpm check:boundaries` lo verifica en CI. Objetivo comercial: poder vender cada módulo por separado.
3. **El backend decide los permisos, no la interfaz.** Toda ruta pasa por: autenticación → contexto de tenant → `requireEntitlement(módulo)` → `requirePermission(recurso, acción)`. La UI solo oculta; la API rechaza.
4. **Cero HEX en componentes.** Los componentes consumen tokens semánticos (`--nexo-*`). Ver DESIGN_SYSTEM.md.
5. **Cero textos de UI en el código.** Todo texto visible va por i18n (`es` por defecto). Ver §6.
6. **Dinero en céntimos enteros** (`bigint`/`number` entero) + código de moneda. Nunca `float`. Fechas en `timestamptz` UTC; la zona horaria es del tenant.
7. **Todo cambio de comportamiento lleva tests** en el mismo commit. Sin tests, no está hecho.
8. **La documentación se actualiza en el mismo commit** que el cambio que la invalida. La v1 murió de documentación obsoleta; aquí no.
9. **Nada de funcionalidad fuera del alcance.** Si una tarea te lleva a construir algo que no está en `MODULES_SPEC.md` (contabilidad, nóminas, TPV, inventario…), para y consulta. La v1 pasó de 3 a ~27 módulos y perdió el foco. Ver «Fuera del MVP» en MODULES_SPEC.md §1.
10. **Secretos nunca en el repositorio, logs ni mensajes de commit.** Ver ARCHITECTURE §14.

## 3. Qué puedes hacer de forma autónoma

El usuario ha concedido autonomía amplia. **Sin pedir permiso** puedes:

- Leer, crear, editar y borrar código, tests, documentación y configuración del repositorio.
- Instalar y actualizar dependencias (siguiendo TECH_STACK.md; registra en él cualquier cambio de librería core).
- Crear y aplicar migraciones **en la base de datos local/de test**.
- Crear y modificar el CI (`.github/workflows/`), Dockerfiles y scripts.
- Hacer `commit` y `push` directamente (a `main` o a ramas), siguiendo §7.
- Ejecutar tests, linters, builds, Storybook y Playwright en local.
- Usar claves **de prueba** de Stripe (modo test), Resend, etc. definidas en `.env` local.

## 4. Qué requiere autorización explícita del usuario

Pregunta y espera un «sí» claro, **cada vez**, antes de:

- **Desplegar** a producción. El usuario ha indicado que, cuando lo autorice, puedes coordinarte con la sesión de Claude del PaaS (**Portledger**) para desplegar. Sin autorización explícita en esa tarea, no la contactes.
- Tocar **datos reales** de producción de forma destructiva (borrar/migrar con pérdida/resetear un tenant real).
- Cambiar configuración de Stripe en **modo live**, rotar o crear secretos de producción.
- Contratar servicios de pago o crear cuentas en terceros.
- Reescribir historial compartido (`push --force` a `main`, `git reset` de commits ya publicados).
- Añadir una dependencia con licencia no permisiva (solo MIT/Apache-2.0/BSD/ISC/MPL sin consultar).
- Cualquier cosa fuera del alcance de MODULES_SPEC.md (regla de oro 9).

## 5. Qué NUNCA debes hacer

- Desactivar, relajar o saltarte RLS, tests de aislamiento, `check:boundaries`, lint o tipos para «hacer pasar» el CI. Si un check falla, arregla la causa.
- Usar `--no-verify` ni saltarte hooks. Si un hook falla, investiga.
- Escribir queries de negocio con el pool de plataforma (`platformDb`) fuera de los módulos autorizados (ver ARCHITECTURE §5.3).
- Loguear PII, tokens, contraseñas o claves (el logger redacta, pero no confíes solo en eso).
- Poner credenciales reales, datos personales reales o claves live en seeds, fixtures o tests.
- Inventar requisitos de negocio. Si falta información, pregunta o registra una decisión abierta (§8).
- Copiar código de la v1 sin entenderlo y adaptarlo a RLS, eventos y aislamiento de módulos.

## 6. Convenciones de código

**Idioma**

| Qué | Idioma |
|---|---|
| Texto de interfaz, mensajes de error al usuario, emails, PDFs | Español (`es-ES`), a través de i18n |
| Comentarios, documentación, descripciones de commit/PR, ADRs | Español |
| Identificadores (variables, funciones, tablas, columnas, rutas API, claves de evento) | **Inglés** (ver nota) |
| Tipos de commit (`feat`, `fix`…) y nombres de ramas | Inglés (convención) |

> Nota (decisión por defecto, reversible): el usuario pidió «código en español». Se interpreta como comentarios, docs, commits y UI en español, con identificadores en inglés por compatibilidad con el ecosistema (Postgres, Stripe, librerías) y con la v1. Registrada como D-01 en ARCHITECTURE §17. Si el usuario quiere identificadores en español, debe indicarlo antes de crear el primer módulo.

**i18n:** `i18next` + `react-i18next` en web; en API, los errores devuelven un `code` estable (`deal.stage.invalid`) y la web lo traduce. Claves por módulo y espacio de nombres: `crm:deal.title`. Está prohibido concatenar frases traducidas. Los números, fechas y monedas usan `Intl` con el locale y la zona horaria del tenant.

**Comentarios:** el usuario mantendrá este código, así que comenta lo que **no es obvio**: el _porqué_ de una decisión, invariantes de seguridad (sobre todo RLS y aislamiento), efectos secundarios, enlaces a la sección de ARCHITECTURE que justifica el patrón. No comentes lo que el código ya dice. Cada módulo tiene un `README.md` propio (qué hace, qué eventos emite/consume, qué puertos declara, cómo probarlo).

**Estructura de un módulo:** ver TECH_STACK.md §3 y ARCHITECTURE §3. Capas `domain/` → `application/` → `infrastructure/` y `http/`; el módulo solo expone lo que sale por su `index.ts`.

**Errores:** jerarquía de errores de aplicación (`NotFoundError`, `ValidationError`, `ConflictError`, `ForbiddenError`, `EntitlementError`, `LimitExceededError`) con `code` estable. Nunca devolver trazas ni mensajes internos al cliente.

**Validación:** Zod en el borde (HTTP, eventos, jobs, webhooks entrantes). Los esquemas viven en `@nexo/contracts` si cruzan módulos o llegan a la web; si no, dentro del módulo.

**Tests (obligatorios):**

- _Unitarios_ (Vitest) para dominio y casos de uso.
- _Integración_ con PostgreSQL real (Testcontainers) para repositorios, RLS, outbox y jobs. **No se mockea la base de datos.**
- _Aislamiento_ (`test:isolation`): matriz automática que enumera las tablas y prueba el acceso cruzado entre tenants. Bloquea el CI.
- _Contrato_ de eventos y de la API pública (OpenAPI generado).
- _Componentes_ (Testing Library) y _accesibilidad_ (axe) en el design system.
- _E2E_ (Playwright) de los flujos críticos: registro, alta de tenant, importación, deal ganado → proyecto, cambio de plan, límites.
- Cobertura mínima: 85 % de líneas/ramas en `domain/` y `application/`; sin umbral global rígido, pero un PR que baje la cobertura de un módulo debe justificarlo.

## 7. Git

**Flujo:** trunk-based. `main` siempre desplegable. Ramas cortas opcionales; el usuario permite `push` directo a `main` si el CI local pasa.

**Ramas:** `<tipo>/<alcance>-<descripcion-corta>` en `kebab-case`. Ej.: `feat/crm-deal-pipeline`, `fix/billing-webhook-retry`.

**Commits** (Conventional Commits; tipo y alcance en inglés, descripción en español, imperativo, ≤ 72 caracteres, sin punto final):

```
<tipo>(<alcance opcional>): <descripción corta>

[cuerpo opcional: qué y por qué, no cómo]

[pie opcional: BREAKING CHANGE, Refs, Co-Authored-By…]
```

- Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Alcances: nombre del módulo o área (`crm`, `delivery`, `identity`, `billing`, `web`, `ui`, `api`, `db`, `ci`, `docs`…).
- Ejemplo: `feat(crm): añade mover oportunidad entre etapas con validación de checklist`.
- Un commit = un cambio lógico. Las migraciones van en el mismo commit que el código que las usa.
- Si el entorno indica una línea de coautoría, añádela como pie (`Co-Authored-By: …`).

**Antes de cada push** deben pasar en local: `pnpm typecheck`, `pnpm lint`, `pnpm check:boundaries`, `pnpm test` (incluye aislamiento). El CI los repite y además ejecuta e2e.

## 8. Decisiones y huecos

- Si tomas una decisión técnica **no trivial** que no esté en estos documentos, crea `docs/adr/NNNN-titulo.md` (contexto, decisión, alternativas, consecuencias) y enlázala desde ARCHITECTURE §17.
- Si necesitas información del usuario que no tienes, añádela a «Decisiones abiertas» (ARCHITECTURE §17.2) y pregúntale. No asumas en silencio.
- Los valores marcados como _«por defecto»_ en los documentos son decisiones provisionales: impleméntalas como **configuración**, no como constantes dispersas en el código.

## 9. Comandos

> Este es el **contrato de scripts** (creado en el hito 0 con estos nombres exactos; mantenlo). Los `db:seed:demo`, `db:reset:demo` y `openapi:generate` existen como esqueleto y fallan con un aviso hasta sus hitos (7 y 8).

```bash
# Requisitos: Node 24 LTS, pnpm 12 (fijado en `packageManager`), Docker o Podman (PostgreSQL y MinIO en local).
# Podman en Windows: `podman machine start` antes de `pnpm infra:up` y de los tests de integración.
# E2E: la primera vez, `pnpm --filter @nexo/web exec playwright install chromium`.
pnpm install                    # instala dependencias (workspace)
pnpm infra:up                   # docker compose: postgres + minio + mailpit (dev)
pnpm infra:down

pnpm dev                        # api + worker + web en paralelo (turbo)
pnpm dev:api | dev:worker | dev:web

pnpm build                      # compila todo el monorepo
pnpm typecheck                  # tsc en todos los paquetes
pnpm lint                       # Biome (lint) en todo el repo
pnpm format                     # Biome (format) con escritura
pnpm check:boundaries           # dependency-cruiser: reglas de aislamiento entre módulos
pnpm check:i18n                 # claves de traducción huérfanas / faltantes

pnpm test                       # unit + integración + aislamiento (Vitest)
pnpm test:unit
pnpm test:integration           # Testcontainers (PostgreSQL real)
pnpm test:isolation             # matriz de aislamiento multitenant (bloqueante)
pnpm test:e2e                   # Playwright contra stack local
pnpm test:a11y                  # axe sobre Storybook / páginas clave
pnpm test:coverage

pnpm db:generate                # drizzle-kit: genera migración desde el esquema
pnpm db:migrate                 # aplica migraciones (rol nexo_owner)
pnpm db:seed                    # catálogo, plantillas verticales, superadmin inicial
pnpm db:seed:demo               # tenant demo con datos ficticios
pnpm db:reset:demo              # resetea el tenant demo
pnpm db:check-rls               # verifica RLS+policies en todas las tablas con tenant_id

pnpm storybook                  # catálogo de componentes del design system
pnpm openapi:generate           # genera el OpenAPI de la API pública
pnpm module:new <nombre>        # genera el esqueleto de un módulo (estructura, README, reglas)
```

Variables de entorno: se documentan en `.env.example` (todas, con comentario). Nunca se commitea `.env`.

## 10. Definición de «hecho» (checklist por tarea)

- [ ] Cumple el criterio de aceptación de MODULES_SPEC.md para esa funcionalidad.
- [ ] Tests nuevos o actualizados; `pnpm test` verde (incluido aislamiento).
- [ ] `typecheck`, `lint`, `check:boundaries`, `check:i18n` verdes.
- [ ] Tablas nuevas: `tenant_id`, RLS forzada, policy, índices con `tenant_id` inicial, FK compuestas.
- [ ] Rutas nuevas: guard de entitlement + permiso + validación Zod + documentadas en OpenAPI.
- [ ] Textos por i18n; sin HEX; estados vacío/carga/error diseñados; accesibilidad por teclado.
- [ ] Eventos nuevos versionados y documentados en MODULES_SPEC.md y `@nexo/contracts`.
- [ ] Documentación y `README` del módulo actualizados; `docs/STATUS.md` al día.
- [ ] Commit(s) con el formato de §7.

## 11. Plan de construcción por hitos

Orden recomendado (dependencias reales, alineado con las releases R1-R4 del PDF). Cada hito termina con tests verdes y `docs/STATUS.md` actualizado.

| Hito | Contenido |
|---|---|
| **0 · Cimientos** | Monorepo, Biome, tsconfig, CI, Docker/infra local, Testcontainers, scripts del §9, generador de módulos, reglas de `dependency-cruiser`, esqueleto `design-tokens`/`ui`/Storybook. |
| **1 · Platform Core** | DB (roles, RLS, `withTenant`), identidad (usuarios, membresías, sesión, invitaciones), alta self-service y manual, roles/permisos, auditoría, superadmin (tenants), outbox + worker, i18n, archivos. Tests de aislamiento completos. |
| **2 · Entitlements y Billing** | Catálogo, Stripe Billing (test), webhooks, entitlements, asientos Full/Light, límites, metering, modo facturación manual, overrides de superadmin. |
| **3 · CRM** | Cuentas, contactos, oportunidades, pipelines, actividades, tareas, notas, timeline, campos, vistas, búsqueda. |
| **4 · Data Onboarding** | Importación CSV/XLSX con mapeo, validación, dedupe, simulación, ejecución asíncrona, rollback, exportación. |
| **5 · Comunicación** | OAuth Google (luego Microsoft), sincronización de buzón/calendario, SMTP del tenant, Resend + metering. |
| **6 · Delivery Lite** | Deal ganado → proyecto, tareas, hitos, estado, tiempo simple, resumen en la cuenta. |
| **7 · Insights, Onboarding y Demo** | Read models y dashboard, wizard, plantilla vertical «Servicios profesionales», checklist de activación, tenant demo con reseteo. |
| **8 · API pública y endurecimiento** | API keys, webhooks, formulario de captación, OpenAPI, plantillas de documentos del tenant, seguridad, rendimiento, runbooks. |

Marca cada hito en `docs/STATUS.md`. Antes de empezar un hito, reléelo en MODULES_SPEC.md y confirma con el usuario si hay dudas (regla de oro 9).

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
