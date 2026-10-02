# MODULES_SPEC.md — Nexo

Especificación del **Core** y de los módulos contratables, con entidades, DTOs principales, eventos, reglas de negocio, entitlements y facturación por módulo/uso. Fuente de producto: `docs/Nexo_Estrategia_Producto_MVP_GTM.pdf` (secciones 05-08). Arquitectura: [ARCHITECTURE.md](ARCHITECTURE.md). Reglas de código: [AGENTS.md](AGENTS.md).

Convenciones de este documento:
- Toda tabla de negocio lleva además `id` (UUIDv7), `tenant_id`, `created_at`, `updated_at` (ver ARCHITECTURE §5.2) aunque no se repita en cada lista.
- Importes en **céntimos enteros** + `currency` (ISO 4217, `EUR` por defecto). Fechas `timestamptz` UTC.
- Los DTOs se escriben en notación TypeScript abreviada; los esquemas Zod reales viven en `@nexo/contracts` y son la fuente de verdad.
- «_(por defecto)_» = valor provisional que se implementa como configuración editable.
- Los precios y límites del PDF son **hipótesis**: viven en el catálogo (§9), no en constantes.

## Índice

1. [Alcance y reglas de modularidad](#1-alcance-y-reglas-de-modularidad)
2. [Platform Core](#2-platform-core)
3. [CRM y Sales Core (`crm`)](#3-crm-y-sales-core-crm)
4. [Comunicación (`communication`)](#4-comunicación-communication)
5. [Delivery Lite (`delivery`)](#5-delivery-lite-delivery)
6. [Data Onboarding (`data-import`)](#6-data-onboarding-data-import)
7. [Insights Basic (`insights`)](#7-insights-basic-insights)
8. [Onboarding y activación (`onboarding`)](#8-onboarding-y-activación-onboarding)
9. [Catálogo comercial, entitlements y facturación](#9-catálogo-comercial-entitlements-y-facturación)
10. [Catálogo de eventos del MVP](#10-catálogo-de-eventos-del-mvp)
11. [Add-ons posteriores](#11-add-ons-posteriores)
12. [Criterios de aceptación y métricas del MVP](#12-criterios-de-aceptación-y-métricas-del-mvp)

---

## 1. Alcance y reglas de modularidad

### 1.1 Resultado que debe demostrar el MVP
Un cliente puede **crear su tenant**, **importar** empresas/contactos/oportunidades, **invitar** al equipo, **conectar** su correo o calendario, gestionar un deal, marcarlo **ganado** y convertirlo en un **proyecto** con tareas, responsable y estado; la dirección ve un **dashboard** básico y Nexo **factura** según usuarios y módulos.

### 1.2 Módulos del MVP

| # | Módulo (PDF) | Código | Entitlement | Incluido en |
|---|---|---|---|---|
| 1 | Platform Core | `identity`, `tenancy`, `billing`, `audit`, `files`, `documents`, `integration` | siempre | Core |
| 2 | CRM y Sales Core | `crm` | `module:crm` | Core |
| 3 | Comunicación | `communication` | `module:communication` | Core (1 buzón por usuario Full) |
| 4 | Delivery Lite | `delivery` | `module:delivery` | Core _(por defecto, D-14)_ |
| 5 | Data Onboarding | `data-import` | `module:data_import` | Core |
| 6 | Insights Basic | `insights` | `module:insights` | Core |
| — | Onboarding (wizard, plantilla vertical, checklist) | `onboarding` | siempre | Core |

### 1.3 Fuera del MVP (no construir; regla de oro 9)

| No construir aún | Sustituto inicial |
|---|---|
| Contabilidad y facturación fiscal nativa | Integración con proveedor adaptado (SIF antes del 1/1/2027 sociedades, 1/7/2027 resto). Nexo factura **su** servicio con Stripe. |
| Inventario, compras, MRP; TPV; nóminas; RRHH; fabricación (todo lo de v1 no listado) | Fuera de la hoja de ruta. |
| Marketing automation completo | Formularios + integración externa. |
| WhatsApp omnicanal | Integración o exportación. |
| IA generativa generalista | Resumen determinista y plantillas. |
| Custom objects no-code | Campos, pipelines y objetos canónicos. |
| App móvil nativa | Web responsive/PWA. |
| MFA, SSO/SCIM, suplantación de usuario | Posterior (plan Scale/Governance). |

### 1.4 Reglas de modularidad (resumen operativo)

1. Cada módulo es **vendible por separado**: no importa a otros módulos; reacciona a **eventos** y usa **puertos** (ARCHITECTURE §4).
2. Un módulo **no contratado** responde `403 entitlement_missing`; sus datos se **conservan**.
3. El **Core** (`platform` + `crm`) está siempre presente; los add-ons dependen _como mucho_ del Core.
4. Las referencias entre módulos son `uuid` sin FK; la coherencia se mantiene por eventos (con _snapshots_ de campos de visualización).
5. Cada módulo lleva `README.md` con eventos emitidos/consumidos, puertos, permisos y claves de entitlement.

### 1.5 Claves de módulo y entitlement (en `@nexo/contracts/modules`)

```ts
type ModuleKey = "crm" | "communication" | "delivery" | "data_import" | "insights"
  /* add-ons futuros: */ | "sales_pro" | "projects_pro" | "support" | "billing_payments"
  | "marketing" | "whatsapp" | "field_service" | "portal" | "automation_bi" | "governance" | "ai_copilot";
// Claves de entitlement: "module:<key>", "seats:full", "seats:light", "seats:<module>", "limit:<métrica>"
```

---

## 2. Platform Core

Conjunto de módulos de plataforma (no se venden aparte). Define identidad, tenants, facturación, auditoría, archivos, documentos e integración.

### 2.1 `tenancy` — tenants, alta y ajustes

**Entidades (plataforma, sin RLS salvo indicación):**

| Tabla | Campos clave |
|---|---|
| `tenants` | `slug` (único, inmutable, apto DNS, reservados), `name`, `status` (`trial`\|`active`\|`past_due`\|`suspended`\|`cancelled`), `trial_ends_at`, `origin` (`self_service`\|`manual`), `is_demo`, `locale`, `timezone`, `currency`, `country`, `flags` jsonb, `custom_domain` (null, reservado) |
| `tenant_settings` (RLS) | `tenant_id`, `key`, `value` jsonb (moneda, zona horaria, formatos, política de correo, `deal_won_creates_project`, requisitos de próxima acción…) |
| `vertical_packs` | `key` (`professional_services`), `version`, definición JSON: pipeline y etapas, roles, campos, plantillas de proyecto/checklist, datos de ejemplo, dashboards |
| `tenant_applied_packs` (RLS) | pack aplicado, versión, fecha |

**Casos de uso:**
- `signupSelfService(input)`: crea `users`, `tenants` (`trial`, 21 días _(por defecto)_), `memberships(owner)`, cliente Stripe, aplica la plantilla elegida y datos de ejemplo marcados `is_sample`.
- `createTenantManually(input)` (superadmin): crea tenant + owner + `billing_mode`; envía invitación.
- `updateTenantStatus`, `extendTrial`, `suspend`, `reactivate`, `cancel` (con retención y exportación).
- `resetDemoTenant` (job nocturno y botón): vuelve el tenant `is_demo` a su estado inicial **sin tocar** credenciales del admin de la demo.
- `exportTenantData` / `deleteTenantData` (RGPD, con confirmación fuerte y auditoría).

**Reglas:**
- `trial` caducado ⇒ acceso bloqueado salvo exportar datos. `past_due` ⇒ gracia configurable (7 días _por defecto_) con aviso.
- El `slug` no cambia nunca; se valida contra la lista de reservados (`app`, `api`, `www`, `admin`, `demo`, `status`…).
- **Superadmin** (panel `/admin`, `scope: platform`): listado/gestión de tenants, estado, extensión de prueba, concesiones manuales (overrides), catálogo y precios, uso por tenant, salud de colas/DLQ/webhooks, auditoría de plataforma, tenant demo (crear/resetear). **Sin** acceso a datos de negocio del tenant.

**DTOs:**
```ts
SignupInput  = { email, password, fullName, companyName, countryCode, templateKey, acceptTerms: true }
TenantAdminDto = { id, slug, name, status, origin, trialEndsAt, billingMode, seats: {full,light}, modules: ModuleKey[], createdAt }
```

### 2.2 `identity` — usuarios, sesión, invitaciones y roles

**Entidades:**

| Tabla | Campos clave |
|---|---|
| `users` (global) | `email` (único, normalizado), `password_hash` (Argon2id), `full_name`, `locale`, `email_verified_at`, `status` |
| `memberships` (RLS) | `user_id`, `role`, `seat_type` (`full`\|`light`\|…), `status`, `last_seen_at`, `title`, `avatar_file_id` |
| `invitations` (RLS) | `email`, `role`, `seat_type`, `token_hash`, `expires_at`, `invited_by`, `accepted_at` |
| `refresh_tokens` (global) | `family_id`, `token_hash`, `rotated_at`, `revoked_at`, `ip`, `user_agent`, `membership_id` |
| `role_permission_overrides` (RLS) | `role`, `permission`, `granted` (bool) |
| `superadmins` (global) | `email`, `password_hash`, `status`, tabla y tokens propios |
| `password_resets`, `email_verifications` | tokens de un solo uso (hash, caducidad) |

**Roles predefinidos (MVP)** y permisos (`<módulo>:<recurso>:<acción>`; acciones `read|create|update|delete|manage|export`):

| Rol | Descripción | Alcance por defecto |
|---|---|---|
| `owner` | Propietario del tenant: todo, incluida facturación y borrado del tenant. Inmutable. | all |
| `admin` | Configura cuenta, usuarios, integraciones, módulos y plantillas; sin borrar tenant. | all |
| `manager` | Ve y edita todo el trabajo comercial y de entrega; ve informes; no administra cuenta. | all |
| `sales` | CRM y comunicación; sin ajustes de cuenta. | `own` (configurable a `all` lectura) |
| `delivery` | Delivery (proyectos/tareas/tiempo) y lectura de cuentas relacionadas. | `own` en edición |
| `viewer` | Solo lectura. Es el rol natural de un asiento **Light**. | `own`/`all` lectura |

Los **asientos** (`full`, `light`) se combinan con rol: un `light` solo puede tener permisos de _consultar, comentar, aprobar, registrar tiempo/tareas y actualizar estados limitados_ (matriz en `@nexo/contracts/permissions`); intentar asignar un permiso fuera de ese conjunto a un asiento Light se rechaza.

**Casos de uso:** registro/login/logout/refresh, selección de empresa (varias membresías), invitar/reenviar/revocar, aceptar invitación, cambiar rol/asiento (validando entitlements), suspender usuario, cambiar contraseña, recuperar contraseña, verificar email, editar matriz de permisos del tenant.

**Reglas:** mínimo un `owner` activo; no se puede degradar al último owner; no se supera el nº de asientos contratados (`LimitExceededError`); invitaciones caducan (7 días); emails normalizados (minúsculas, sin alias de dominio especial); contraseñas ≥ 12 caracteres con comprobación contra listas comunes; bloqueo progresivo tras fallos; **toda** acción sensible a `audit`.

### 2.3 `billing` — catálogo, Stripe y entitlements

Detalle de modelo y flujos en ARCHITECTURE §8. Funciones:

- **Catálogo** editable (productos, métricas, precios, versiones) sincronizado con Stripe (productos/precios).
- **Suscripción**: checkout configurable (usuarios Full/Light, módulos, bundles), portal del cliente (método de pago, facturas, cancelación controlada), prorrateo, impuestos (Stripe Tax), _dunning_.
- **Entitlements**: instantánea efectiva por tenant (`module:*`, `seats:*`, `limit:*`) recalculada en cada cambio; superposición de **overrides** del superadmin; estado `trial` con entitlements de prueba (todo el Core + un módulo opcional).
- **Metering**: contadores de uso y envío a Stripe Meters con tope.
- **Modo manual**: `billing_mode = manual` (sin Stripe) con overrides y facturación externa.
- **Calculadora in-app** (PDF §08): muestra coste mensual estimado según la configuración antes de pagar; bundles guiados.

**DTO público:**
```ts
EntitlementsDto = {
  modules: ModuleKey[];
  seats: { full: { used: number; limit: number }; light: { used: number; limit: number } };
  limits: Record<string, { used: number; limit: number | null; enforcement: "hard" | "soft" }>;
  trial?: { endsAt: string };
  billing: { mode: "stripe" | "manual"; status: "trialing" | "active" | "past_due" | "canceled" };
}
```

**Reglas:** checkout con ≤ 5 conceptos; mínimo 5 usuarios Full _(por defecto)_; descuento anual y recargo mensual configurables; _price lock_ 12 meses; permitir downgrade/pausa/exportación; si un webhook se pierde, la conciliación nocturna corrige; los entitlements existentes siguen vigentes durante una caída de Stripe.

### 2.4 `audit` — auditoría y telemetría

- `audit_log` (RLS; global para acciones de plataforma): quién (`actor`), qué (`action` estable), sobre qué (`entity`), `before/after` (sin secretos), `ip`, `request_id`, `occurred_at`. **Solo escritura** desde la app; consulta paginada para `owner/admin` (tenant) y superadmin (plataforma).
- Acciones auditadas: login/fallos, cambios de rol/permisos, invitaciones, exportaciones, conexión/desconexión de integraciones, API keys, cambios de plan/overrides, borrados y resets, acciones del superadmin.
- `product_events` (telemetría de producto, **sin PII**): hitos de activación (`import.completed`, `invite.sent`, `mailbox.connected`, `deal.created`, `deal.won`, `project.created.from_deal`…) para calcular la **activación** y las señales **PQL** (PDF §08-09).

### 2.5 `files` — archivos

`files` (RLS): `owner_module`, `entity_type`, `entity_id`, `key`, `filename`, `content_type`, `size`, `sha256`, `uploaded_by`, `status`. Reglas: URL firmada de corta vida, validación de tipo/tamaño, cuota de almacenamiento por tenant (`limit:storage_gb`), borrado en cascada lógica con el dueño, exportaciones con caducidad (ARCHITECTURE §12).

### 2.6 `documents` — plantillas y PDFs

`document_templates` (RLS): `kind` (`quote`\|`invoice`\|`report`…), `config` jsonb (`logo_file_id`, `accent_color`, `header_text`, `footer_text`, `legal_text`, `issuer` {razón social, NIF, dirección}, `blocks` visibles, `locale`), `version`, `is_default`. API: `renderDocument(kind, data, templateId?) → fileId`. Gestión mínima por el tenant en Ajustes con **vista previa en vivo**. Se versiona la plantilla usada para reproducir cada documento (ARCHITECTURE §11).

### 2.7 `integration` — API, webhooks y credenciales

| Tabla (RLS) | Contenido |
|---|---|
| `api_keys` | `name`, `prefix`, `key_hash`, `scopes` (`module:read|write`), `last_used_at`, `expires_at`, `revoked_at` |
| `webhook_endpoints` | `url`, `secret` (cifrado), `events[]`, `active`, `failure_count` |
| `webhook_deliveries` | `endpoint_id`, `event_id`, `status`, `attempts`, `response_code`, `next_attempt_at` |
| `integration_credentials` | `provider`, `kind`, `ciphertext`, `key_id`, `meta`, `status` |
| `capture_forms` | `token`, `name`, `target` (`contact`\|`deal`), `mapping`, `pipeline_id`, `owner_membership_id`, `active` |
| `usage_events` | ver §2.3 / §9 (API requests) |

Reglas: la API key se muestra **una sola vez**; webhooks firmados HMAC-SHA256 con marca de tiempo; reintentos con backoff y DLQ; el formulario de captación tiene _honeypot_, _rate limit_ y valida el consentimiento; las requests con API key cuentan contra `limit:api_requests`.

### 2.8 Criterios de aceptación del Core
- Un usuario no puede consultar ni inferir datos de otro tenant; tests automatizados de aislamiento verdes (incluye búsqueda, importación, eventos y API keys).
- Alta self-service completa en < 2 minutos hasta ver el workspace con datos de ejemplo.
- Cambio de plan reflejado en entitlements sin intervención manual (webhook → recálculo < 10 s).
- UI y API rechazan consistentemente funciones no contratadas.
- Toda acción sensible aparece en la auditoría.

---

## 3. CRM y Sales Core (`crm`)

**Problema:** centralizar cliente, actividad y pipeline. **Entitlement:** `module:crm` (Core). **Prefijo de tablas:** `crm_`.

### 3.1 Entidades

| Tabla | Campos clave |
|---|---|
| `crm_accounts` (empresas) | `name`, `legal_name`, `tax_id`, `domain`, `industry`, `size_band`, `website`, `phone`, `address` jsonb, `owner_membership_id`, `status` (`prospect`\|`active`\|`at_risk`\|`inactive`), `source`, `custom` jsonb, `is_sample`, `deleted_at` |
| `crm_contacts` | `account_id` (FK compuesta), `first_name`, `last_name`, `email`, `phone`, `job_title`, `owner_membership_id`, `consent` jsonb, `status`, `custom` jsonb, `is_sample`, `deleted_at` |
| `crm_pipelines` | `name`, `is_default`, `position` (límite por entitlement: 3 en Core) |
| `crm_pipeline_stages` | `pipeline_id`, `name`, `position`, `probability` (0-100), `kind` (`open`\|`won`\|`lost`), `checklist` jsonb (requisitos para entrar) |
| `crm_deals` (oportunidades) | `account_id`, `primary_contact_id`, `pipeline_id`, `stage_id`, `name`, `amount_cents`, `currency`, `probability`, `expected_close_on`, `owner_membership_id`, `status` (`open`\|`won`\|`lost`), `lost_reason`, `next_action_at`, `next_action_text`, `closed_at`, `stage_changed_at`, `custom` jsonb, `is_sample` |
| `crm_deal_contacts` | relación deal ↔ contactos con rol (`decision_maker`, `champion`…) |
| `crm_activities` | `kind` (`note`\|`call`\|`meeting`\|`email`\|`stage_change`\|`system`), `subject`, `body`, `occurred_at`, `account_id?`, `contact_id?`, `deal_id?`, `author_membership_id`, `source` (`user`\|`communication`\|`import`\|`system`), `external_ref` |
| `crm_tasks` | `title`, `due_at`, `status` (`open`\|`done`), `priority`, `assignee_membership_id`, `account_id?`, `contact_id?`, `deal_id?`, `completed_at`, `reminder_at` |
| `crm_tags`, `crm_taggings` | etiquetas por entidad |
| `crm_custom_fields` | `entity` (`account`\|`contact`\|`deal`), `key`, `label`, `type` (`text`\|`number`\|`date`\|`select`\|`multiselect`\|`bool`\|`url`), `options`, `required`, `position` (límite razonable por entidad, p. ej. 30) |
| `crm_saved_views` | `entity`, `name`, `filters`, `columns`, `sort`, `visibility` (`private`\|`team`), `owner_membership_id` |
| `crm_search_index` | `tsvector` + `pg_trgm` por entidad (columna generada o tabla auxiliar) para búsqueda global |

### 3.2 Casos de uso (aplicación)
CRUD de cuentas/contactos/oportunidades con validación; **mover oportunidad** entre etapas (valida checklist y probabilidad; registra `stage_change`); marcar **ganada/perdida** (motivo obligatorio al perder); reasignar propietario (individual/lote); fusionar duplicados; registrar actividad/nota/llamada/reunión; crear/completar/posponer tareas; timeline unificado por cuenta/contacto/oportunidad; etiquetar; campos personalizados; vistas guardadas; **búsqueda global** por cliente/contacto/oportunidad; exportar a CSV; _soft delete_ y restauración 30 días.

### 3.3 Reglas de negocio
- **Propietario y siguiente acción obligatorios** en oportunidades abiertas (configurable por tenant: `require_next_action`); alerta visual si la acción está vencida.
- Mover oportunidad en **< 3 clics** (arrastrar en el kanban o menú de etapa); validaciones no bloquean la interfaz sin explicar qué falta.
- Una oportunidad en etapa `won` es inmutable en importe salvo permiso `crm:deal:manage`; reabrir exige permiso y queda en el _timeline_.
- Límites: pipelines por entitlement; campos personalizados; registros (50.000 contactos+empresas incluidos, aviso suave).
- Unicidad: `(tenant_id, lower(email))` por contacto cuando exista; `(tenant_id, tax_id)` blando por cuenta (aviso de duplicado, no bloqueo).
- Permisos por alcance: `own` ve lo asignado o creado por él; `all` ve todo. La búsqueda respeta el alcance.
- Consentimiento y RGPD: campo `consent` y registro de origen del dato; exportación/borrado por interesado.

### 3.4 DTOs principales
```ts
DealDto = { id, name, accountId, accountName, primaryContactId?, pipelineId, stageId, stageName,
            amountCents, currency, probability, expectedCloseOn?, ownerId, status,
            nextActionAt?, nextActionText?, customFields: Record<string, unknown>, createdAt, updatedAt }
MoveDealInput = { stageId: string; reason?: string; checklistConfirmed?: string[] }
CreateContactInput = { accountId?, firstName, lastName?, email?, phone?, jobTitle?, ownerId?, customFields? }
TimelineItemDto = { id, kind, subject, body?, occurredAt, author?, entity: { type, id, name }, source }
GlobalSearchResult = { type: "account"|"contact"|"deal", id, title, subtitle?, score }
```

### 3.5 Eventos
- **Emite:** `crm.account.created|updated|deleted.v1`, `crm.contact.created|updated|deleted.v1`, `crm.deal.created|updated.v1`, `crm.deal.stage_changed.v1`, `crm.deal.won.v1`, `crm.deal.lost.v1`, `crm.task.created|completed.v1`, `crm.activity.logged.v1`.
- **Consume:** `communication.email.received.v1`, `communication.email.sent.v1`, `communication.meeting.created.v1` (los registra como actividades); `import.batch.requested.v1` indirectamente vía puerto (ver abajo).
- **Puertos que implementa (adaptadores):** `ContactLookup` (para `communication`), `ImportTarget` (para `data-import`: `upsert`, `delete` por lote), `AccountReference` (para otros módulos que necesiten validar existencia sin importar `crm`).

`crm.deal.won.v1` payload (público): `{ dealId, name, accountId, accountName, amountCents, currency, ownerId, primaryContactId?, contacts: [...], wonAt, scope?: string, expectedDelivery?: {...} }`.

### 3.6 Permisos
`crm:account|contact|deal|task|activity:{read,create,update,delete,export}`, `crm:deal:manage`, `crm:pipeline:manage`, `crm:customfield:manage`, `crm:view:manage`.

### 3.7 Criterios de aceptación
Crear y mover oportunidades en < 3 clics; búsqueda global por cliente/contacto con resultados < 300 ms (p95, volumen del ICP); _timeline_ unificado; vistas y campos configurables sin tocar código; tests de aislamiento y de alcance `own/all`.

---

## 4. Comunicación (`communication`)

**Problema:** reducir actualización manual y cambios de contexto. **Entitlement:** `module:communication` (Core; **1 buzón/calendario por usuario Full**). **Prefijo:** `comm_`.

### 4.1 Entidades

| Tabla | Campos clave |
|---|---|
| `comm_connections` | `membership_id`, `provider` (`google`\|`microsoft`), `email`, `scopes`, `credential_id`, `status` (`active`\|`needs_reauth`\|`error`), `sync_cursor`, `last_synced_at`, `error` |
| `comm_messages` | `connection_id`, `external_id`, `thread_id`, `direction`, `from`, `to[]`, `cc[]`, `subject`, `snippet`, `sent_at`, `has_attachments`, `linked` jsonb (`contactIds`, `accountIds`, `dealIds` _sin FK_) |
| `comm_calendar_events` | `connection_id`, `external_id`, `title`, `starts_at`, `ends_at`, `attendees[]`, `location`, `meeting_url`, `linked` jsonb |
| `comm_email_outbox` | `kind` (`tenant_to_customer`\|`system`), `via` (`tenant_smtp`\|`resend`\|`mailbox`), `to`, `subject`, `body_ref`, `status`, `attempts`, `provider_message_id`, `billable` bool |
| `comm_smtp_settings` | `host`, `port`, `security`, `username`, `credential_id`, `from_name`, `from_email`, `verified_at` |
| `comm_email_templates` | plantillas de email del tenant (`key`, `subject`, `body`, `locale`, `variables`) |

### 4.2 Casos de uso
Conectar buzón/calendario por OAuth (Google primero, Microsoft con el mismo contrato `MailCalendarProvider`); sincronización incremental (job, `historyId`/`deltaLink`); **registrar automáticamente** correos y reuniones como actividades vinculadas al contacto/cuenta/oportunidad por dirección de email (vía `ContactLookup`); **crear reunión/tarea desde Nexo** (evento en el calendario del proveedor); enviar correo desde Nexo por: buzón conectado, SMTP del tenant o Resend (ARCHITECTURE §10.3); configurar y probar SMTP del tenant; plantillas de email; desconectar (revoca token y detiene la sync, conserva lo ya registrado salvo petición de borrado).

### 4.3 Reglas
- Minimización: se guardan metadatos y _snippet_; el cuerpo se pide al proveedor bajo demanda _(por defecto, OD-03)_.
- Solo se registran correos con contactos existentes o dominios de cuentas del CRM (evita ingerir correo privado); lista de dominios/personas **excluidos** por usuario.
- Cada envío por **Resend de Nexo** genera un `usage_event` `platform_email_sent` (facturable, §9.3). Si hay SMTP del tenant verificado, **no** se factura.
- Tokens cifrados; si el proveedor revoca el acceso la conexión pasa a `needs_reauth` con aviso al usuario y al admin.
- Límite: 1 conexión activa por usuario Full (entitlement `limit:mailboxes`).

### 4.4 Eventos
- **Emite:** `communication.email.received.v1`, `communication.email.sent.v1`, `communication.meeting.created.v1`, `communication.connection.status_changed.v1`.
- **Consume:** `crm.contact.created|updated.v1` (re-vincular mensajes), `billing.entitlements.changed.v1`.
- **Puertos que declara:** `ContactLookup.findByEmail(ctx, email) → { contactId, accountId } | null` (implementado por `crm`; si falta, se degrada a no vincular).

### 4.5 Criterios de aceptación
Un correo con un contacto aparece en su _timeline_ sin acción manual; crear una reunión desde Nexo la deja en el calendario del proveedor; conexión > 60 % de los _trials_ como meta; fallo de proveedor no afecta a la app (aislado en worker con reintentos y estado «Reconectar»).

---

## 5. Delivery Lite (`delivery`)

**Problema:** eliminar el corte entre venta y ejecución. **Entitlement:** `module:delivery` (Core _(por defecto)_). **Prefijo:** `delivery_`. **Independiente de `crm`:** recibe el trato ganado por evento y guarda una **referencia** a la cuenta.

### 5.1 Entidades

| Tabla | Campos clave |
|---|---|
| `delivery_projects` | `name`, `status` (`planned`\|`in_progress`\|`at_risk`\|`blocked`\|`done`\|`cancelled`), `health` (`on_track`\|`at_risk`\|`off_track`), `account_id` (uuid sin FK), `account_name` (_snapshot_), `source_deal_id` (único por tenant → idempotencia), `owner_membership_id`, `starts_on`, `due_on`, `summary`, `template_id`, `is_sample` |
| `delivery_tasks` | `project_id`, `milestone_id?`, `title`, `description`, `status` (`todo`\|`doing`\|`blocked`\|`done`), `assignee_membership_id`, `due_on`, `position`, `completed_at` |
| `delivery_milestones` | `project_id`, `name`, `due_on`, `status`, `position` |
| `delivery_time_entries` | `project_id`, `task_id?`, `membership_id`, `minutes`, `worked_on`, `note`, `billable` |
| `delivery_project_templates` | `name`, `kickoff_checklist` jsonb, `default_tasks` jsonb, `default_milestones` jsonb |
| `delivery_project_members` | `project_id`, `membership_id`, `role` |
| `delivery_comments` | comentarios por proyecto/tarea (apto para asiento Light) |

### 5.2 Casos de uso
**Crear proyecto desde Deal Won** (handler de `crm.deal.won.v1`, idempotente por `source_deal_id`): aplica la plantilla (checklist de kickoff, tareas e hitos por defecto), asigna responsable (propietario del deal o regla), copia contexto (alcance, contactos, importe) y **resume el contexto en el proyecto**; crear proyecto manual; CRUD de tareas e hitos; asignar; cambiar estado/salud; **registro de tiempo simple**; comentar; resumen de proyectos de una cuenta (endpoint `GET /delivery/projects?accountId=`, consumido por el _slot_ «Proyectos» de la ficha de cuenta).

### 5.3 Reglas
- **Deal Won → proyecto en < 10 s** (outbox + _flush_ inmediato). Si el handler falla, reintento con backoff y alerta; el usuario ve «Creando proyecto…» y un estado de error recuperable con botón «Crear ahora».
- La creación automática se puede desactivar por tenant (`deal_won_creates_project`) y por pipeline.
- Un proyecto con tareas vencidas o bloqueadas pasa a `at_risk` (regla simple y explicable; no «IA»).
- `account_name` se mantiene sincronizado por `crm.account.updated.v1`; si la cuenta se borra, el proyecto conserva el _snapshot_ y se marca `account_archived`.
- Los usuarios **Light** pueden ver, comentar, actualizar estados limitados y registrar tiempo en sus tareas; no crear/borrar proyectos.
- **Projects & Time Pro (add-on futuro)** ampliará: dependencias, recursos/capacidad, presupuesto, coste, facturable/no facturable y portal.

### 5.4 Eventos
- **Emite:** `delivery.project.created|updated.v1`, `delivery.project.status_changed.v1`, `delivery.project.completed.v1`, `delivery.task.created|completed.v1`, `delivery.time.logged.v1`.
- **Consume:** `crm.deal.won.v1`, `crm.account.updated|deleted.v1`, `billing.entitlements.changed.v1`.

### 5.5 Criterios de aceptación
Deal Won crea proyecto con datos y checklist en < 10 s; el estado del proyecto es visible desde la cuenta; todo el módulo funciona si `crm` no está disponible para consultas (usa sus propias tablas); tests de idempotencia (un deal ganado dos veces → un proyecto).

---

## 6. Data Onboarding (`data-import`)

**Problema:** convertir la migración en autoservicio fiable. **Entitlement:** `module:data_import` (Core). **Prefijo:** `import_`. Escribe en CRM **solo a través del puerto `ImportTarget`**.

### 6.1 Pipeline (PDF §08)
1. Detectar origen y plantilla (CSV/XLSX; guías de exportación de Pipedrive, HubSpot, Holded).
2. Subir y **perfilar** (codificación, cabeceras, tipos, vacíos, identificadores, muestra).
3. **Mapear** con sugerencias (campos estándar, personalizados, valores de listas).
4. **Validar** (formatos, emails, fechas, moneda, propietario, relaciones empresa-contacto-oportunidad).
5. **Deduplicar** (reglas exactas y aproximadas, con previsualización y decisión del usuario).
6. **Simular** (_dry run_): altas, actualizaciones, rechazados, conflictos; sin escribir.
7. **Ejecutar** en job asíncrono: progreso, reintentos, errores descargables, trazabilidad.
8. **Rollback** del lote completo o corrección y reintento.
9. Importar primero datos **activos**; histórico y adjuntos en una segunda fase.

### 6.2 Entidades

| Tabla | Campos clave |
|---|---|
| `import_batches` | `kind` (`companies`\|`contacts`\|`deals`\|`mixed`), `status` (`uploaded`\|`profiled`\|`mapped`\|`validated`\|`simulated`\|`running`\|`completed`\|`failed`\|`rolled_back`), `source`, `file_id`, `stats` jsonb, `created_by`, `started_at`, `finished_at` |
| `import_mappings` | `batch_id`, `source_column`, `target_field`, `transform`, `required`, `saved_as_template` |
| `import_rows` | `batch_id`, `row_number`, `raw` jsonb, `normalized` jsonb, `status` (`valid`\|`invalid`\|`duplicate`\|`skipped`\|`imported`), `errors` jsonb, `resolution` |
| `import_items` | `batch_id`, `entity_type`, `entity_id`, `action` (`created`\|`updated`), `previous` jsonb (para rollback) |
| `import_mapping_templates` | mapeos reutilizables por origen |

### 6.3 Reglas
- Parser con peculiaridades españolas: separador `;`, coma decimal, fechas `DD/MM/YYYY`, codificación UTF-8/Windows-1252 detectada.
- **Plantilla de 8-12 campos esenciales**; el resto aparece al necesitarlo.
- Tamaño y filas máximos configurables; el procesado es por lotes con _checkpoint_ (reanudable).
- Dedupe: clave de email normalizado, dominio+nombre, NIF; las coincidencias dudosas se decidirán en una pantalla de revisión.
- **Rollback** deshace por `import_items` (borra lo creado, restaura lo actualizado) dentro de una ventana (30 días _(por defecto)_); no revierte cambios posteriores del usuario sobre esos registros sin avisar.
- Exportación completa (CSV/XLSX/JSON) de los datos del tenant disponible siempre (portabilidad).
- Todo registro importado de muestra puede ser sustituido: los datos `is_sample` se eliminan con un clic al importar los reales.

### 6.4 Eventos y puertos
- **Emite:** `import.batch.completed.v1`, `import.batch.failed.v1`, `import.batch.rolled_back.v1`.
- **Declara el puerto** `ImportTarget { validate(ctx, entity, rows), upsertMany(ctx, entity, rows, batchId), deleteMany(ctx, entity, ids), restoreMany(...) }` (adaptador `crm` en la composición).

### 6.5 Criterios de aceptación
> 95 % de filas válidas importadas sin soporte en un fichero estándar; simulación fiel (el resultado final coincide con lo simulado); rollback completo probado; errores descargables y explicados; rendimiento: 10.000 filas en minutos sin degradar la app.

---

## 7. Insights Basic (`insights`)

**Problema:** dar visibilidad sin construir BI completo. **Entitlement:** `module:insights` (Core). **Prefijo:** `insights_`. No consulta tablas de otros módulos: se alimenta de **eventos** y mantiene sus propios _read models_.

### 7.1 Read models (alimentados por eventos)

| Tabla | Contenido |
|---|---|
| `insights_deal_facts` | `deal_id`, `owner_id`, `pipeline_id`, `stage_id`, `amount_cents`, `status`, `created_at`, `closed_at`, `stage_changed_at`, `lost_reason` |
| `insights_stage_history` | transiciones de etapa (para conversión y ciclo medio) |
| `insights_activity_daily` | actividades por usuario y día (tipo) |
| `insights_project_facts` | proyecto, estado, salud, vencidos, bloqueados |
| `insights_adoption_daily` | usuarios activos, invitaciones, conexiones |
| `insights_snapshots` | instantáneas diarias (pipeline ponderado, nº de deals) para tendencias |

### 7.2 Dashboards del MVP
- **Panel de ventas** (referencia visual en DESIGN_SYSTEM §11): **Pipeline** (valor y variación), **Conversión**, **Ciclo medio**, **Actividad**, **Ingresos previstos** (últimos 8 meses), actividad reciente, oportunidades abiertas.
- **Proyectos en riesgo** (de `delivery`).
- **Adopción y uso de la cuenta** (usuarios activos, importación, conexión, invitaciones).
- Filtros por periodo, propietario, pipeline; **exportación** a CSV.

### 7.3 Reglas
- Cada dashboard aparece solo si el módulo origen está contratado (p. ej. «Proyectos en riesgo» requiere `delivery`).
- Las cifras son **reproducibles** desde los _read models_ y coinciden con las del módulo origen (test de conciliación).
- Recalculado idempotente por eventos y _backfill_ por job al contratar el módulo o importar datos.
- Rendimiento: dashboard < 3 s en el volumen del ICP; _skeleton_ por tarjeta; caché con invalidación por evento.
- Los usuarios con alcance `own` ven solo sus métricas; `manager`/`admin` ven las de equipo.

### 7.4 Eventos
- **Consume:** `crm.deal.*`, `crm.activity.logged.v1`, `crm.task.*`, `delivery.project.*`, `delivery.task.*`, `identity.membership.*`, `communication.connection.status_changed.v1`.
- **Emite:** ninguno de negocio (solo métricas internas).

### 7.5 Criterios de aceptación
Dashboard carga en < 3 s; cifras coherentes con el origen; vistas por rol; exportación funcional.

---

## 8. Onboarding y activación (`onboarding`)

**Objetivo:** primer valor en **< 30 minutos** (PDF §08). **Prefijo:** `onboarding_`.

### 8.1 Flujo (21 días)
Minuto 0-5: elegir plantilla vertical y ver el workspace con **datos de ejemplo** → 5-15: personalizar lo mínimo (nombre, pipeline, roles, moneda, zona horaria) → 15-30: **importar** datos reales (CSV, mapeo, dedupe, simulación) → día 1: conectar **email/calendario** → día 3: invitar al equipo, asignar cartera → día 7: probar **Deal → Project Lite** y dashboard → día 14: resumen de actividad/ROI → día 21: convertir (elegir bundle, usuarios, módulos).

### 8.2 Entidades

| Tabla | Contenido |
|---|---|
| `onboarding_progress` | `tenant_id`, `checklist` jsonb (pasos y estado), `activated_at`, `current_step`, `dismissed` |
| `onboarding_milestones` | hitos de activación alcanzados (`import_50_records`, `mailbox_connected`, `invited_3_users`, `deal_created_or_moved`, `project_from_deal`) con fecha |
| `onboarding_checklist_templates` | definición de checklist por vertical |

La **plantilla vertical** «Servicios profesionales» (`vertical_packs`, §2.1) define: pipeline y etapas con probabilidad, roles recomendados, campos (tipo de servicio, tarifa, margen estimado…), plantilla de proyecto (kickoff), datos de ejemplo (`is_sample`) y dashboard por defecto. Sub-plantillas: marketing, desarrollo software, ingeniería, formación corporativa.

### 8.3 Reglas
- **Activación** = ≥ 50 registros válidos importados + buzón/calendario conectado + 3 usuarios invitados + una oportunidad creada o movida + un proyecto generado desde un deal (o de prueba). Calculada desde `product_events` (§2.4), sin PII.
- El checklist es visible, descartable y retomable; cada paso lleva a la pantalla real (no a un manual).
- Datos demo **reemplazables**: «Borrar datos de ejemplo» no toca datos reales (`is_sample`).
- Señales **PQL** (PDF §09) se registran para uso interno del superadmin (panel «cuentas con señales»).
- Calculadora de coste y resumen de uso antes de pagar (con `billing`).

### 8.4 Criterios de aceptación
Time to first value < 30 min para una cuenta nueva; checklist que refleja el estado real; plantilla vertical aplicada sin pasos manuales; datos de ejemplo eliminables sin efectos secundarios.

---

## 9. Catálogo comercial, entitlements y facturación

> Todos los valores son **iniciales y editables** desde el catálogo (hipótesis del PDF §07). Los importes son €/mes, **antes de IVA**, con compromiso anual salvo indicación.

### 9.1 Tipos de usuario

| Tipo | Puede | Precio |
|---|---|---|
| **Full** | Crear/editar en los módulos contratados, ser propietario, automatizar, reportar | **19 €/usuario/mes**, mínimo **5** |
| **Light** | Consultar, comentar, aprobar, registrar tiempo/tareas, actualizar estados limitados | **6 €/usuario/mes** |
| Agente/Especialista | Acceso completo a un módulo especializado (soporte, field service) | incluido en el precio del módulo |
| Admin | Configurar cuenta, seguridad, billing e integraciones | incluido en Full |
| Portal externo | Consultar y colaborar en elementos compartidos | gratis hasta límite de MAU |

### 9.2 Catálogo de productos

| Producto | Métrica | Precio inicial | Estado |
|---|---|---|---|
| **Nexo Core** (CRM, Comunicación, Delivery Lite, Import, Insights) | Usuario Full | 19 € | MVP |
| Light Seat | Usuario | 6 € | MVP |
| Sales Pro | Usuario comercial | +8 €/usuario | Posterior |
| Projects & Time Pro | Usuario de delivery | +9 €/usuario | Posterior |
| Support Desk | Agente | +11 €/agente | Posterior |
| Field Service | Técnico | +14 €/técnico | Posterior |
| Billing & Payments | Cuenta | +49 €/mes | Posterior |
| Marketing & Nurture | Cuenta + contactos activos | +59 €/mes (2.000 contactos) | Posterior |
| WhatsApp & Omnicanal | Número + uso | +29 €/número + coste Meta/BSP | Posterior |
| Automation & BI | Cuenta + ejecuciones | +49 €/mes (5.000 runs) | Posterior |
| Governance (SSO/SAML, SCIM, auditoría extendida, sandbox, SLA) | Cuenta | +99 €/mes | Posterior |
| AI Copilot | Créditos de uso | por definir (margen bruto ≥ 75 %) | Posterior |

### 9.3 Consumo medido (metering)

| Métrica | Incluido | Exceso / ampliación | MVP |
|---|---|---|---|
| Registros CRM | 50.000 (contactos+empresas) | packs de 50.000 por 20 €/mes | modelado, aviso suave |
| Almacenamiento | 50 GB + 2 GB por Full | 50 GB por 10 €/mes | **aplicado** |
| Pipelines | 3 (Core); 10 (Sales Pro) | más con plan Scale | **aplicado** |
| Buzones/calendarios | 1 por usuario Full | buzón compartido en Support | **aplicado** |
| Automatizaciones | 500 reglas simples (Core); 5.000 runs (módulo) | 5.000 runs por 15 € | posterior |
| API | 100.000 requests/mes | packs o plan Scale | **aplicado** |
| Emails enviados por la plataforma (sin SMTP propio) | _(por definir)_ | **sobrecoste por envío** vía Resend (`platform_email_sent`) | **aplicado y medido** |
| Marketing | tiers por contactos/envíos | — | posterior |
| WhatsApp | 2.000 contactos activos y 20.000 envíos | _pass-through_ Meta/BSP | posterior |
| Portal | 100 usuarios externos activos/mes | 250 MAU por 20 € | posterior |
| Auditoría | 90 días en Core | 24 meses en Governance | retención aplicada |
| IA | créditos de prueba | packs con _spend cap_ | posterior |

### 9.4 Bundles guiados (configuraciones de compra, no planes cerrados)

| Paquete | Desde | Incluye |
|---|---|---|
| **Nexo Start** | 135 €/mes | 5 Full + Sales Pro para 5 |
| **Nexo Flow** | 329 €/mes | 10 Full + 5 Sales Pro + 8 Projects + Billing |
| **Nexo Scale** | 749 €/mes | 20 Full + 10 Sales + 10 Projects + 5 Support + Billing + Automation + Governance |

En el MVP (sin Sales Pro/Billing/Support) se ofrece **Core con N usuarios Full + M Light**; los bundles se activan al lanzar los módulos. El catálogo ya los modela.

### 9.5 Reglas comerciales (configurables)
Descuento anual 15-17 %; mensual con recargo 18-20 %; _price lock_ 12 meses con aviso de 60 días; prueba de 21 días con datos propios; permitir _downgrade_, pausa y exportación; máximo 5 conceptos en el checkout; onboarding autoservicio gratis, paquete asistido 490 € (bonificable), migración avanzada desde 1.500 € (servicios, fuera del producto).

### 9.6 Entitlements por módulo (clave → efecto)

| Clave | Efecto técnico |
|---|---|
| `module:crm` | Rutas y UI de CRM; pipelines según `limit:pipelines`. |
| `module:communication` | Conexión de buzones, sync, envío; `limit:mailboxes`. |
| `module:delivery` | Proyectos/tareas; handler de `crm.deal.won.v1` activo. |
| `module:data_import` | Importación/exportación y rollback. |
| `module:insights` | Dashboards y read models; _backfill_ al activar. |
| `seats:full` / `seats:light` | Validación al invitar/activar usuarios y al cambiar asiento. |
| `limit:storage_gb`, `limit:api_requests`, `limit:pipelines`, `limit:mailboxes`, `limit:crm_records` | Contadores y _enforcement_ `hard`/`soft`. |

### 9.7 Ejemplos de factura (verificación de cálculo)

| Escenario | Configuración | MRR |
|---|---|---|
| Agencia de 8 personas | 8 Full + 3 Sales + 8 Projects + Billing | 152 + 24 + 72 + 49 = **297 €** |
| Consultora de 15 | 15 Full + 5 Sales + 12 Projects + Billing + Automation | 285 + 40 + 108 + 49 + 49 = **531 €** |
| Solo Core, 5 Full + 3 Light (MVP) | 5 Full + 3 Light | 95 + 18 = **113 €** (el mínimo de 5 Full se cumple; el PDF fija mínimo 5 usuarios) |

(Los dos primeros son del PDF sobre módulos posteriores y sirven de **tests de cálculo** del motor de precios; el tercero es un caso MVP.)

### 9.8 Pruebas obligatorias de facturación
Cálculo de MRR (con casos del PDF), prorrateo, cambio de asientos, downgrade, _trial_ → pago, `past_due` y gracia, webhooks duplicados/desordenados (idempotencia), override del superadmin, modo manual, conciliación nocturna, `LimitExceededError` al superar asientos, _spend cap_ de metering.

---

## 10. Catálogo de eventos del MVP

Todos versionados, con esquema Zod en `@nexo/contracts/events` y test de contrato. Marca **P** = candidato a webhook público.

| Evento | Emisor | Consumidores | P |
|---|---|---|---|
| `tenancy.tenant.created.v1` | tenancy | onboarding, billing, audit | |
| `tenancy.tenant.status_changed.v1` | tenancy | billing, communication, audit | |
| `identity.membership.created\|updated\|removed.v1` | identity | billing (asientos), insights, audit | |
| `billing.entitlements.changed.v1` | billing | todos los módulos (caché/handlers) | |
| `billing.subscription.changed.v1` | billing | tenancy, audit | |
| `crm.account.created\|updated\|deleted.v1` | crm | delivery, communication, insights | P |
| `crm.contact.created\|updated\|deleted.v1` | crm | communication, insights | P |
| `crm.deal.created\|updated.v1` | crm | insights | P |
| `crm.deal.stage_changed.v1` | crm | insights | P |
| `crm.deal.won.v1` | crm | **delivery**, insights, onboarding | P |
| `crm.deal.lost.v1` | crm | insights | P |
| `crm.task.created\|completed.v1` | crm | insights | |
| `crm.activity.logged.v1` | crm | insights, onboarding | |
| `communication.email.received\|sent.v1` | communication | crm (actividad), insights | |
| `communication.meeting.created.v1` | communication | crm (actividad/tarea) | |
| `communication.connection.status_changed.v1` | communication | onboarding, insights, audit | |
| `delivery.project.created\|updated.v1` | delivery | insights | P |
| `delivery.project.status_changed.v1` | delivery | insights | P |
| `delivery.task.created\|completed.v1` | delivery | insights | |
| `delivery.time.logged.v1` | delivery | insights | |
| `import.batch.completed\|failed\|rolled_back.v1` | data-import | onboarding, insights, audit | |
| `onboarding.activated.v1` | onboarding | audit/telemetría | |

Cualquier evento nuevo debe añadirse aquí **en el mismo commit** (regla de oro 8).

---

## 11. Add-ons posteriores

Resumen para no perder el hilo de la hoja de ruta (PDF §05 y §11). Cada uno será un módulo nuevo con las mismas reglas de aislamiento; **no se construyen en el MVP**.

| Módulo | Depende de | Evento de entrada | Resultado |
|---|---|---|---|
| Sales Pro (múltiples pipelines, forecast, presupuestos, firma, scoring) | CRM Core | Lead cualificado / oportunidad creada | Propuesta, forecast, deal ganado |
| Projects & Time Pro (dependencias, recursos, presupuesto, timesheets, portal) | Core | Deal ganado | Proyecto, horas, riesgo, entrega |
| Support Desk (tickets, SLA, base de conocimiento, CSAT) | Core | Solicitud recibida | Ticket, señal de riesgo u oportunidad |
| Billing & Payments (presupuesto→factura, recurrencia, cobro) | Core + Projects | Propuesta aceptada / hito facturable | Factura, cobro (integración fiscal por partner) |
| Marketing & Nurture | Core | Contacto con consentimiento | Campaña, scoring |
| Field Service, WhatsApp, Portal, Automation & BI, Governance, AI Copilot | según PDF | — | — |

Criterios de entrada de un módulo nuevo (PDF §04): demanda repetida (≥ 5 clientes activos o 15 oportunidades cualificadas con el mismo _job_), potencial de +15 % de ARPA o reducción material del _churn_, uso semanal esperado por ≥ 30 % de usuarios de las cuentas objetivo, ≥ 70 % del flujo compartido sin código a medida, operable con documentación estándar, sin obligar a construir un ERP.

---

## 12. Criterios de aceptación y métricas del MVP

**Aceptación (PDF §06):** aislamiento total entre tenants con tests automatizados · crear/mover oportunidades en < 3 clics · > 95 % de filas válidas importadas sin soporte · Deal Won → proyecto en < 10 s · dashboard < 3 s · UI y API rechazan funciones no contratadas de forma consistente · cambio de plan sin intervención manual · primer valor en < 30 min.

**Métricas de activación a instrumentar (PDF §08):**

| Métrica | Objetivo inicial | Alerta |
|---|---|---|
| Time to first value | < 30 min | > 60 min o requiere soporte |
| Import success | > 95 % filas válidas | < 85 % o errores sin explicación |
| Invitación | 3+ usuarios en 72 h | Cuenta de un solo usuario en ICP multiusuario |
| Conexión email/calendario | > 60 % de trials | < 40 % |
| Cross-module activation (Deal → Project) | > 50 % de la prueba | < 25 % |
| Trial → pago | 25-35 % en PQLs | < 15 % |
| Onboarding completion | > 70 % | < 50 % |

**Tenant demo:** datos ficticios realistas del vertical «Servicios profesionales» (agencia/consultora: cuentas, contactos, oportunidades en todas las etapas, proyectos con tareas y riesgos, actividad, dashboard poblado, un buzón simulado), fechas **relativas a hoy**, credenciales del admin de la demo constantes (en `.env`, no reales), reseteo manual y nocturno, `last_reset_at` visible en el panel de superadmin.
