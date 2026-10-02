# TECH_STACK.md — Nexo

Stack exacto y estructura del repositorio. Las versiones son las **últimas estables publicadas en npm el 2026-10-03** (comprobadas con `npm view`). Al inicializar el repo, `pnpm install` fija el _lockfile_; a partir de ahí se actualiza de forma deliberada (Renovate/Dependabot con PR agrupados). Cualquier cambio de librería **core** se registra aquí y, si es relevante, en un ADR.

> Criterio: madurez, rendimiento y mantenibilidad por una sola persona. Preferir menos piezas y bien conocidas.

## 1. Runtime y herramientas

| Pieza | Elección | Notas |
|---|---|---|
| Runtime | **Node.js 24 LTS** | `engines.node >= 24`. |
| Gestor de paquetes | **pnpm 12.x** (workspaces) | `packageManager` fijado. pnpm 12 **bloquea scripts de instalación**: los permitidos se declaran en `allowBuilds` de `pnpm-workspace.yaml` (lefthook, esbuild, argon2); añadir uno exige motivo. |
| Orquestador de tareas | **Turborepo 2.x** | Caché de `build/typecheck/lint/test`. |
| Lenguaje | **TypeScript 6.0.x** (estricto) | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`. **No TS 7** todavía: `dependency-cruiser` no soporta su API y se saltaba los fuentes sin avisar (ver ADR 0001). Reevaluar cuando dependency-cruiser publique soporte. |
| Lint + formato | **Biome 2.x** | Un único binario para lint y format (sustituye ESLint+Prettier). Reglas propias de i18n/HEX mediante plugin Biome o script `check:*`. |
| Fronteras entre módulos | **dependency-cruiser 18** | `pnpm check:boundaries`; reglas en `.dependency-cruiser.cjs` (ver ARCHITECTURE §4). |
| Hooks Git | **lefthook** | `pre-commit`: format+lint rápido; `commit-msg`: valida Conventional Commits (`commitlint`); `pre-push`: typecheck + boundaries + tests rápidos. |
| CI | **GitHub Actions** | Ver §6. |

## 2. Backend (`apps/api`, `apps/worker`)

| Capa | Elección | Versión |
|---|---|---|
| Framework HTTP | **Fastify** | 5.x |
| Validación y contratos | **Zod** (+ `fastify-type-provider-zod`) | zod 4.x · provider 7.x |
| OpenAPI | `@fastify/swagger` + `@fastify/swagger-ui` | 9.x |
| Base de datos | **PostgreSQL 18** (mínimo 17) | Extensiones: `pg_trgm`, `unaccent`, `pgcrypto`. UUIDv7 nativo (`uuidv7()`) o generado en app. |
| ORM / migraciones | **Drizzle ORM** + **drizzle-kit** | drizzle-orm 0.45.x · drizzle-kit 0.31.x. Esquema TypeScript → SQL versionado. RLS y políticas se definen con el helper `enableTenantRls()` en migración SQL. |
| Driver | `pg` (node-postgres) con pool propio | Dos pools: `appDb` (rol `nexo_app`) y `platformDb` (rol `nexo_platform`). |
| Colas y jobs | **pg-boss** | 12.x. Sobre el propio PostgreSQL. |
| Auth/JWT | **jose** + **argon2** (Argon2id) | jose 6.x · argon2 0.4x |
| Cookies, CORS, seguridad | `@fastify/cookie`, `@fastify/cors`, `@fastify/helmet`, `@fastify/rate-limit` | Última 5.x-compatible. |
| Logging | **pino** | 10.x, con `redact`. |
| Observabilidad | **OpenTelemetry** SDK Node | _Exporter_ configurable (OD-04). |
| Pagos | **stripe** (SDK oficial) | 23.x. Stripe Billing + Meters + Tax + Checkout + Customer Portal. |
| Email del sistema / consumo | **resend** | 6.x. |
| SMTP del tenant | **nodemailer** | 10.x. |
| Plantillas de email | `@react-email/components` | 1.x. |
| Google | `googleapis` (Gmail, Calendar, OAuth2) | 182.x |
| Microsoft | `@azure/msal-node` + `@microsoft/microsoft-graph-client` | msal 7.x · graph 3.x |
| PDF | **@react-pdf/renderer** (servidor, Node) | 4.x |
| Importación | `papaparse` (CSV) + `exceljs` (XLSX) | papaparse 5.x · exceljs 4.x. Parser con quirks españoles (`;`, coma decimal, `DD/MM/YYYY`) heredado como _lección_ de v1. |
| Almacenamiento | `@aws-sdk/client-s3` (+ `s3-request-presigner`) | Compatible con cualquier S3. |
| Cifrado | `node:crypto` (AES-256-GCM) | Sin dependencia externa. |
| IDs | UUIDv7 | `uuidv7()` de PG o librería `uuidv7`. |

Estructura de ejecución: `apps/api/src/api.ts` (HTTP), `apps/api/src/worker.ts` (pg-boss + dispatcher + schedulers), `apps/api/src/migrate.ts`. **Un solo paquete** `apps/api` con tres puntos de entrada y una imagen Docker; `apps/worker` es un alias de script, no un paquete separado (menos fricción para mantener). **Build:** `esbuild` empaqueta los tres entry points a `dist/*.js` (ESM); las dependencias de npm quedan externas y los paquetes `@nexo/*` (que exportan TypeScript) se incluyen en el bundle. Desarrollo con `tsx watch`.

## 3. Frontend (`apps/web`) y design system

| Capa | Elección | Versión |
|---|---|---|
| UI | **React** | 19.x |
| Bundler/dev | **Vite** | 8.x |
| Enrutado | **TanStack Router** (rutas tipadas) | 1.x |
| Datos de servidor | **TanStack Query** | 5.x |
| Tablas | **TanStack Table** | 8.x |
| Estado de UI | **Zustand** | 5.x |
| Formularios | **React Hook Form** + `@hookform/resolvers` (Zod) | última |
| Estilos | **Tailwind CSS 4** (`@theme` mapeado a tokens `--nexo-*`) | 4.x |
| Primitivas accesibles | **Radix UI** (vía componentes propios en `@nexo/ui`) | última |
| Iconos | **Lucide** (`lucide-react`) con `strokeWidth={1.75}` | última. Icono mock hasta tener el set definitivo. |
| Gráficos | **Recharts** estilizado con la paleta de series | última |
| Tipografía | `@fontsource-variable/inter` (eje `opsz` para «Inter Display») | Self-hosted, sin CDN. |
| i18n | **i18next** + **react-i18next** | 26.x · 17.x |
| PWA | **vite-plugin-pwa** | 1.x |
| Catálogo de componentes | **Storybook 10** (`@storybook/react-vite`, addon-a11y) | 10.6.x. Telemetría desactivada. `pnpm storybook` / `pnpm --filter @nexo/ui build-storybook`. |
| Fechas | `Intl` nativo + `date-fns` para cálculo | última |

El _handoff_ del manual de identidad pide Storybook, tokens JSON y QA de accesibilidad: implementados en el hito 0 (tokens → CSS/Tailwind generados, Storybook, test de contraste WCAG y axe en e2e). Utilidades Tailwind de color: `bg-canvas`, `bg-surface`, `text-primary|secondary|muted`, `border-line`, `bg-action-primary`, `text-success`/`bg-success-bg`… (mapa en `packages/design-tokens/scripts/build.mjs`).

## 4. Pruebas

| Tipo | Herramienta |
|---|---|
| Unitarias e integración | **Vitest 5** (`projects`: unit / integration / isolation) |
| BD real en tests | **Testcontainers** (`@testcontainers/postgresql` 12.x), imagen `postgres:18`; migraciones reales y roles reales (`nexo_app`) |
| Componentes | `@testing-library/react` + `@testing-library/user-event` + `jsdom`/happy-dom |
| Accesibilidad | `axe-core` (Storybook + Playwright) |
| E2E | **Playwright** 1.6x |
| Contratos de eventos/API | Tests con los esquemas de `@nexo/contracts`; OpenAPI _snapshot_ |
| Mocks de red | **MSW** (web) y `nock`/servidores falsos (Stripe/Resend/Google en integración) |
| Datos de prueba | _factories_ propias (`@nexo/testing`); semilla del tenant demo reutilizable |

**Notas de entorno de tests (aprendidas en el hito 0):**
- Los tests de integración y aislamiento usan Testcontainers con `postgres:18-alpine`. Funcionan con Docker y con **Podman** (Windows: `podman machine start`, que expone `npipe:////./pipe/docker_engine`).
- Con Podman la comprobación de «puerto interno» de Testcontainers se cuelga (usa `exec` en el contenedor); por eso `startTestDatabase()` espera por **log** (`database system is ready…`) y en Windows desactiva Ryuk (`TESTCONTAINERS_RYUK_DISABLED=true`). Si un test se aborta, pueden quedar contenedores huérfanos: `podman rm -f $(podman ps -aq --filter ancestor=postgres:18-alpine)`.
- Los errores de PostgreSQL llegan envueltos por Drizzle («Failed query…»); el mensaje real está en `error.cause`. Los tests de aislamiento usan `expectPgError()` para comprobar el **motivo** (RLS/permisos), no solo que algo falle.

Regla: **no se mockea PostgreSQL**. Stripe/Resend/Google se simulan en el borde (puerto/adaptador), nunca dentro del dominio.

## 5. Estructura del repositorio (monorepo)

```
nexo/
├── AGENTS.md  CLAUDE.md  ARCHITECTURE.md  TECH_STACK.md  DESIGN_SYSTEM.md  MODULES_SPEC.md
├── package.json  pnpm-workspace.yaml  turbo.json  biome.json  tsconfig.base.json
├── .dependency-cruiser.cjs  commitlint.config.cjs  lefthook.yml
├── .env.example                      # TODAS las variables, comentadas
├── docker-compose.yml                # infra local: postgres, minio, mailpit
├── docker/                           # Dockerfile.api, Dockerfile.web, Caddyfile
├── .github/workflows/                # ci.yml, security.yml
│
├── docs/
│   ├── Nexo_Estrategia_Producto_MVP_GTM.pdf   # origen de producto
│   ├── Nexo_Sistema_Identidad_UIUX_v1.pptx    # origen de identidad
│   ├── adr/                          # decisiones (NNNN-titulo.md)
│   ├── runbooks/                     # operación: backups, restauración, incidentes, rotación de secretos
│   └── STATUS.md                     # estado real del proyecto
│
├── apps/
│   ├── api/                          # backend (tres entry points: api, worker, migrate)
│   │   ├── drizzle/                  # migraciones SQL generadas (versionadas)
│   │   ├── scripts/                  # seed, check-rls, reset demo
│   │   └── src/
│   │       ├── api.ts  worker.ts  migrate.ts
│   │       ├── composition/          # ÚNICO lugar que conoce a todos los módulos: rutas, eventos, jobs, adaptadores de puertos
│   │       ├── platform/             # KERNEL compartido (ver abajo)
│   │       └── modules/
│   │           ├── identity/  tenancy/  billing/  audit/  files/  documents/  integration/   # plataforma
│   │           └── crm/  communication/  delivery/  data-import/  insights/  onboarding/     # negocio
│   │               # cada módulo: index.ts, README.md, domain/, application/, ports/, infrastructure/, http/, events/, jobs/, __tests__/
│   └── web/                          # SPA/PWA
│       ├── public/                   # manifest, iconos mock, logo mock
│       └── src/
│           ├── app/                  # shell, rutas raíz, composición de módulos y slots, providers
│           ├── features/             # crm/ delivery/ communication/ data-import/ insights/ onboarding/ settings/ admin/ (superadmin) auth/
│           ├── shared/               # hooks y utilidades sin dominio
│           └── locales/              # es/ y en/ por namespace
│
├── packages/
│   ├── contracts/                    # @nexo/contracts: DTOs Zod, esquemas de eventos, permisos, claves de módulo/entitlement
│   ├── design-tokens/                # @nexo/design-tokens: tokens JSON → CSS vars / Tailwind theme
│   ├── ui/                           # @nexo/ui: componentes del design system + Storybook
│   ├── testing/                      # @nexo/testing: factories, helpers de tenant, utilidades de integración
│   └── config/                       # @nexo/config: tsconfig, biome, vitest compartidos
│
└── tools/
    ├── new-module/                   # generador `pnpm module:new`
    └── check-i18n/                   # script de claves faltantes/huérfanas
```

### 5.1 Directorios clave explicados

| Directorio | Responsabilidad | Reglas |
|---|---|---|
| `apps/api/src/platform/` | **Kernel**: `db/` (pools, `withTenant`, helpers RLS), `tenant/` (contexto, `TenantResolver`), `events/` (outbox, bus, envelope), `http/` (guards: auth, estado de tenant, entitlement, permiso), `errors/`, `config/` (env validado con Zod), `logger/`, `jobs/` (`defineTenantJob`), `ports/` (`AuditLogger`, `FileStorage`, `DocumentRenderer`), `crypto/`. | Importable por **todos** los módulos. No importa módulos. Mínimo y estable. |
| `apps/api/src/composition/` | Registro de rutas, suscriptores, jobs y adaptadores de puertos. | Único punto que importa varios módulos. |
| `apps/api/src/modules/<m>/` | Un dominio completo. | Importa solo `platform/`, `@nexo/contracts` y sus propios archivos. Sale solo por `index.ts`. |
| `apps/api/drizzle/` | SQL de migración. | Nunca se edita a mano una migración ya aplicada; se crea una nueva. |
| `apps/web/src/app/` | Shell, router, providers, registro de módulos y _slots_. | Único punto que importa varias `features`. |
| `apps/web/src/features/<f>/` | UI de un módulo (rutas, componentes, hooks de API, textos). | No importa otras `features`. |
| `packages/contracts` | Lenguaje común entre front, back y módulos. | Sin dependencias de runtime pesadas (solo Zod). |
| `packages/design-tokens` | Fuente única de tokens (JSON). | Se genera CSS y tema Tailwind a partir de ella. |
| `packages/ui` | Componentes primitivos y compuestos, documentados en Storybook. | Solo consume tokens `--nexo-*`. |
| `docs/adr` | Historial de decisiones. | Numeración correlativa. |

Convenciones de nombres: ficheros `kebab-case.ts`; tipos/clases `PascalCase`; funciones/variables `camelCase`; tablas `snake_case` con prefijo de módulo (`crm_deals`); eventos `modulo.entidad.hecho` + versión (`crm.deal.won` v1); claves i18n `namespace:seccion.clave`; variables de entorno `NEXO_*` o del proveedor (`STRIPE_*`, `RESEND_*`, `GOOGLE_*`).

## 6. CI/CD (GitHub Actions)

`ci.yml` (en cada push/PR):

1. `pnpm install --frozen-lockfile` (caché pnpm + turbo).
2. `typecheck`, `lint`, `check:boundaries`, `check:i18n` (en paralelo).
3. `test` (unit + integración con Testcontainers + **aislamiento**), con cobertura.
4. `build` de `api` y `web`; build de imágenes Docker (sin publicar en ramas).
5. `test:e2e` (Playwright) contra el stack levantado con Compose.
6. `test:a11y` sobre Storybook.
7. Auditoría de dependencias y escaneo de secretos.

`security.yml` (programado semanal): `pnpm audit`, escaneo SAST, revisión de licencias.

Publicación de imágenes y despliegue: **solo con autorización explícita** del usuario (AGENTS.md §4). El CI puede construir y etiquetar; el despliegue lo coordina el agente con Portledger.

## 7. Variables de entorno (resumen; detalle en `.env.example`)

| Grupo | Variables (prefijo) |
|---|---|
| General | `NODE_ENV`, `NEXO_PUBLIC_URL`, `NEXO_API_URL`, `TENANT_RESOLUTION_MODE` (`session`\|`subdomain`), `NEXO_BASE_DOMAIN` |
| Base de datos | `DATABASE_URL_APP` (rol `nexo_app`), `DATABASE_URL_PLATFORM` (`nexo_platform`), `DATABASE_URL_OWNER` (solo `migrate`) |
| Seguridad | `JWT_SIGNING_KEYS` (con `kid`), `ENCRYPTION_KEYS` (con `key_id`), `COOKIE_SECRET`, `SUPERADMIN_BOOTSTRAP_EMAIL/PASSWORD` (solo primer arranque) |
| Stripe | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` (test en local, live solo en PaaS) |
| Email | `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM_SYSTEM` |
| Google / Microsoft | `GOOGLE_CLIENT_ID/SECRET`, `MS_CLIENT_ID/SECRET/TENANT` |
| Almacenamiento | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` |
| Observabilidad | `OTEL_EXPORTER_OTLP_ENDPOINT`, `LOG_LEVEL` |
| Demo | `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_PASSWORD` (credenciales **de la demo**, no reales) |

El arranque falla de forma explícita si falta una variable obligatoria (esquema Zod en `platform/config`).

## 8. Versiones: política de actualización

- Dependencias de runtime: Renovate agrupado semanal; _majors_ con PR propio y CI completo.
- Node: seguir la LTS vigente; PostgreSQL: una versión mayor por detrás de la última si hace falta estabilidad del PaaS (mínimo 17).
- Un cambio de librería core (Fastify, Drizzle, React, Tailwind, Stripe SDK, pg-boss) requiere nota en este fichero y pasar el CI completo, incluido aislamiento.
