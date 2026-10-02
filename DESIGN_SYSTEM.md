# DESIGN_SYSTEM.md — Nexo

Sistema visual y de interfaz de Nexo. Fuente: `docs/Nexo_Sistema_Identidad_UIUX_v1.pptx` (v1.0, octubre 2026). Este documento lo traduce a reglas implementables. La identidad Nexo se usa **en toda la aplicación** (cliente y superadmin); no hay temas de color por tenant (D-13). El logo del tenant solo aparece en los documentos que genera (PDFs), no en el chrome de la app.

> Todo lo marcado **«derivado»** no está en el manual y lo ha completado el agente con criterio de coherencia; revisar cuando exista el diseño definitivo.

## 1. Concepto y principios

**Concepto:** _Conectar sin saturar_ — «Todo conectado. Solo lo necesario.» Cada módulo es un nodo autónomo que comparte contexto con los demás. La identidad se construye sobre órbitas abiertas, puntos de conexión y capas que aparecen solo cuando aportan valor.

Cinco filtros para cada decisión visual:

| Principio | Regla práctica |
|---|---|
| **Claridad** | Cada pantalla responde a una pregunta principal. |
| **Modularidad** | Componentes combinables sin perder coherencia. |
| **Densidad útil** | Más información por área, nunca más ruido. |
| **Continuidad** | El contexto viaja entre ventas, entrega y soporte. |
| **Accesibilidad** | Contraste, foco y estados perceptibles por diseño. |

Criterio de calidad: _la interfaz debe sentirse más simple que el proceso que representa._

## 2. Arquitectura de tokens (4 capas)

```
01 Primitivos   purple.700 · neutral.950 · space.4           (valores crudos)
02 Semánticos   color.action.primary.bg · color.surface.default · color.text.secondary   (significado; cambia por tema)
03 Componente   button.primary.bg · table.row.hover · input.error.border
04 Producto     CRM · Delivery · Billing  (matices por módulo, solo si hace falta)
```

**Reglas:**

1. Ningún componente referencia un HEX ni un primitivo directamente: consume **tokens semánticos o de componente** (`var(--nexo-color-action-primary-bg)`).
2. La fuente única es `packages/design-tokens` (JSON). De ahí se generan: CSS custom properties (`--nexo-*`), el `@theme` de Tailwind 4, y la documentación en Storybook.
3. El cambio de tema (Light/Dark) solo cambia los valores de los tokens semánticos; la lógica del producto no cambia.
4. Nomenclatura CSS: `--nexo-color-<grupo>-<rol>[-<estado>]`, p. ej. `--nexo-color-border-default`, `--nexo-color-action-primary-bg`, `--nexo-space-4`, `--nexo-radius-control`.
5. Tema: atributo `data-theme="light|dark"` en `<html>`; por defecto `prefers-color-scheme`; elección del usuario persistida en su perfil. Sin negro ni blanco puros: los neutros tienen un matiz violeta.

## 3. Color

### 3.1 Paleta de marca

| Nombre | HEX | Uso |
|---|---|---|
| Deep Ink | `#17111F` | Texto y fondos oscuros de marca. |
| Nexo Purple | `#6D28D9` | Color principal / acción en Light. |
| Module Indigo | `#4338CA` | Estructura y elementos de módulo. |
| Signal Cyan | `#0E7490` | Señal, información secundaria, acentos. |
| Cloud | `#F5F3FF` | Fondos suaves de marca. |

### 3.2 Escala púrpura (primitivos `purple.*`)

`50 #F5F3FF` · `100 #EDE9FE` · `200 #DDD6FE` · `300 #C4B5FD` · `400 #A78BFA` · `500 #8B5CF6` · `600 #7C3AED` · **`700 #6D28D9` (core Light)** · `800 #5B21B6` · `900 #4C1D95` · `950 #2E1065`.

El **700** es la acción principal en Light; el **400** toma el relevo como acción principal en Dark para mantener contraste.

### 3.3 Tokens semánticos Light / Dark

| Token | Light | Dark | Función |
|---|---|---|---|
| `color.bg.canvas` | `#F8F7FC` | `#0E0B14` | Fondo global |
| `color.surface.default` | `#FFFFFF` | `#15111E` | Tarjetas y paneles |
| `color.surface.raised` | `#FFFFFF` | `#1D1728` | Popovers y elevación |
| `color.surface.hover` | `#F3F0F7` | `#251E32` | Hover / selección suave |
| `color.border.default` | `#D8D2E0` | `#40364D` | Controles y cards |
| `color.divider.subtle` | `#ECE8F0` | `#2B2435` | Separación interna |
| `color.text.primary` | `#1B1724` | `#F7F5FA` | Títulos y datos |
| `color.text.secondary` | `#625C6F` | `#C1BACB` | Apoyo y metadatos |
| `color.text.muted` | `#827A8E` | `#928A9F` | Placeholder y ayuda |
| `color.focus.ring` | `#7C3AED` | `#A78BFA` | Foco de teclado |
| `color.action.primary.bg` | `#6D28D9` | `#A78BFA` | CTA principal |
| `color.action.primary.fg` | `#FFFFFF` | `#120B20` | Texto sobre CTA |

**Derivados** (no están en el manual; se calculan a partir de los anteriores y se validan con el test de contraste):

| Token (derivado) | Light | Dark |
|---|---|---|
| `color.action.primary.bg.hover` | `purple.800` `#5B21B6` | `purple.300` `#C4B5FD` |
| `color.action.primary.bg.active` | `purple.900` `#4C1D95` | `purple.200` `#DDD6FE` |
| `color.action.primary.bg.disabled` | `purple.200` `#DDD6FE` | `#40364D` |
| `color.action.secondary.*` | fondo `surface.default`, borde `border.default`, texto `text.primary`, hover `surface.hover` | ídem con tokens Dark |
| `color.action.ghost.*` | transparente; hover `surface.hover`; texto `text.primary` | ídem |
| `color.selection.tint` | `purple.50` + borde `purple.700` 2 px | `purple.950` + borde `purple.400` 2 px |
| `color.accent.signal` | `#0E7490` | tinte claro de cian (derivado, ≥ 4,5:1 sobre `surface.default`) |

### 3.4 Colores semánticos de estado

Cada estado tiene _foreground / background / borde_. El color **siempre** va acompañado de **icono y texto**; nunca es el único portador de significado.

| Estado | Light (fg / bg) | Dark (fg / bg) | Uso |
|---|---|---|---|
| Éxito | `#166534` / `#F0FDF4` | `#4ADE80` / `#0E1A12` | Confirmación y crecimiento |
| Advertencia | `#92400E` / `#FFFBEB` | `#FBBF24` / `#2A1B00` | Riesgo reversible |
| Error | `#991B1B` / `#FEF2F2` | `#F87171` / `#2A0F12` | Bloqueo o dato inválido |
| Información | `#1E40AF` / `#EFF6FF` | `#60A5FA` / `#0B1A2C` | Ayuda y contexto |

_Borde_ (derivado): mezcla del `fg` al ~30 % sobre `bg` en cada tema.

### 3.5 Series de gráficos (categorías)

`Purple #6D28D9` · `Blue #2563EB` · `Teal #0F766E` · `Orange #C2410C` · `Pink #BE185D` · `Slate #64748B`. Reglas: una sola serie → **morado + neutros**; la paleta completa solo con categorías distintas; máximo 6 series; etiquetas directas; objetivos con línea discontinua; no usar color como único código. En Dark, ajustar luminosidad de las series (derivado) validando contraste ≥ 3:1 contra `surface.default`.

## 4. Accesibilidad (WCAG 2.2 AA mínimo, AAA en lo crítico)

- Texto normal ≥ **4,5:1**; texto grande y componentes UI ≥ **3:1**; AAA normal ≥ 7:1.
- Referencias del manual: texto principal Light 16,5:1 (AAA) · secundario Light 6,4:1 (AA) · principal Dark 18,0:1 · secundario Dark 9,9:1 · CTA 7,1:1 en ambos temas.
- **Restricción de `color.text.muted` (hallazgo del hito 0):** en Light da 3,84:1 sobre `color.bg.canvas`, por debajo de AA (4,5:1) para texto pequeño. Se mantiene el color del manual, pero **solo** se usa en texto grande (≥ 18 px, o ≥ 14 px en negrita), iconos y ayuda no esencial. El texto informativo pequeño (captions, metadatos, eslóganes) usa `color.text.secondary`. Pendiente de decidir con el diseño definitivo si se oscurece el token.
- **Foco visible siempre:** anillo de 2 px + _offset_ 2 px (`color.focus.ring`); nunca depender solo del cambio de color.
- Estados = icono + texto + color. Navegación completa por teclado. Etiquetas persistentes (el _placeholder_ no sustituye a la etiqueta). Errores asociados al campo con `aria-describedby`.
- `prefers-reduced-motion`: sustituir desplazamiento por _fade_; sin _parallax_ ni zoom.
- Objetivos táctiles ≥ 44×44 px en móvil (preset Touch 56 px).
- **QA automatizada:** test de contraste sobre todos los pares de tokens (falla el CI si un par baja del umbral), `axe` en Storybook/Playwright, revisión manual de lector de pantalla en flujos clave.

## 5. Tipografía

| Familia | Uso |
|---|---|
| **Inter Display** | Títulos, métricas y mensajes clave. |
| **Inter** | Cuerpo, navegación, tablas y formularios. |

Open-source, _self-hosted_ (sin CDN). Se implementa con **Inter variable** (`@fontsource-variable/inter`): «Inter Display» = misma fuente con el eje óptico `opsz` alto (`font-optical-sizing: auto` + `font-variation-settings: "opsz" 32` en titulares). Pesos usados: 400, 500, 600, 700 (**máximo 2 pesos y 3 tamaños dominantes por vista**). **Numerales tabulares** (`font-variant-numeric: tabular-nums`) en columnas financieras, KPIs y tablas. Soporte completo de `Ñ`, `€`, `%`, `−`.

| Estilo | Tamaño / interlínea | Peso | Ejemplo |
|---|---|---|---|
| H1 / Página | 32 / 40 | 700 | Panel de ventas |
| H2 / Sección | 24 / 32 | 700 | Oportunidades abiertas |
| H3 / Componente | 18 / 26 | 600 | Actividad reciente |
| Body L | 16 / 24 | 400 | Resumen del rendimiento comercial |
| Body | 14 / 20 | 400 | Acme Digital · propuesta enviada |
| Table / UI | 13 / 18 | 500 | 28.400 € · 24 días |
| Caption | 12 / 16 | 500 | Actualizado hace 18 min |

Regla: construir jerarquía con **tamaño y peso antes que con color**.

## 6. Foundations

| Aspecto | Valor |
|---|---|
| Unidad base | **4 px** |
| Escala de espacio | 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 (`--nexo-space-*`) |
| Grid | 12 columnas en desktop (_gutter_ 24/32 px); 8 en tablet; 4 en móvil. Ancho máximo de contenido **1440 px** |
| Radios | `6` chips · `10` controles · `12` cards · `16` modales · `999` pills |
| Elevación | `0` borde · `1` sombra `0 1 2 / 6 %` · `2` sombra `0 8 24 / 10 %`. El **borde** define la mayoría de superficies; la sombra se reserva para elementos flotantes (popovers, menús, modales). |
| Densidad (presets, no ajustes por pantalla) | **Compacta 40 px · Estándar 48 px · Touch 56 px** (altura de fila/control). Por defecto: Estándar en desktop, Touch en móvil; el usuario puede elegir Compacta. |
| Breakpoints (derivados del grid) | móvil < 768 · tablet 768-1199 · desktop ≥ 1200 |

## 7. Componentes y patrones

Todos viven en `packages/ui`, tienen _story_ con todos sus estados (Light y Dark), tests de accesibilidad y consumen solo tokens.

### 7.1 Botones
Altura estándar **40 px**, radio **10 px**, icono 16-18 px. Variantes: **Primario**, **Secundario**, **Ghost**; estados: default, hover, active, disabled, focus. **Una sola acción primaria por panel.** `loading` conserva ancho y etiqueta accesible. Etiquetas en minúscula con verbo claro («Crear oportunidad», no «CREAR AHORA»). Sin _glow_ ni doble acento.

### 7.2 Formularios
Etiqueta **persistente** sobre el campo, ayuda contextual debajo, validación **explícita** con icono + texto (p. ej. «Introduce un importe válido»). Controles: input, select, textarea, checkbox, switch, radio, fecha, moneda (formato `es-ES` con numerales tabulares). Validación al salir del campo y al enviar; el botón de envío no se desactiva «por si acaso», explica qué falta. Autoguardado donde proceda; confirmación antes de acciones destructivas.

### 7.3 Cards y superficies
Agrupan información; **no sustituyen la estructura de página**. Default: borde 1 px, radio 12 px, padding 16/20 px. Seleccionada: tinte + borde 2 px. Sombra solo si flota.

### 7.4 Tablas de datos
Sin líneas verticales; **cifras alineadas a la derecha**; cabecera fija en _scroll_; fila 40 px (compacta) / 48 px (estándar). **Orden, filtros y selección visibles**; estado = icono + texto + color; acciones secundarias en _hover_ (siempre accesibles por teclado y en móvil mediante menú); **vacíos y _loading_ diseñados** (_skeleton_ desde 400 ms). Columnas configurables y vistas guardadas. En móvil, las tablas se convierten en listas de tarjetas con los 2-3 campos clave.

### 7.5 Navegación
Barra lateral **expandida 240 px / colapsada 72 px**; estado activo = tinte + indicador + peso tipográfico. Pestañas (Resumen · Actividad · Archivos · Automatizaciones), _breadcrumbs_ (Ventas / Acme Digital / Propuesta), _badges_ (Neutral, Información, Riesgo, + estados semánticos). En móvil: barra inferior con 4-5 destinos y menú «Más». Los destinos visibles dependen de módulos contratados y permisos (ARCHITECTURE §13.2).

### 7.6 Dashboards
Una pregunta principal por vista; fila de KPI (valor grande en Inter Display, variación con icono + signo + texto), gráficos que **explican, no ornamentan** (etiquetas directas, objetivo con línea discontinua), listas de actividad y tablas de «próximas acciones». Carga < 3 s con volumen del ICP; _skeleton_ por tarjeta. Los números usan formato del tenant.

### 7.7 Patrones transversales
- **Estados vacíos:** ilustración mínima con **órbita abierta** + explicación + acción primaria; nunca una tabla en blanco sin guía.
- **Errores:** mensaje con causa y siguiente paso; el código estable de la API se traduce vía i18n.
- **Confirmaciones destructivas:** diálogo (radio 16) con nombre del elemento y consecuencia; _undo_ cuando sea posible.
- **Upsell de módulo no contratado:** pantalla informativa con valor, precio de referencia y botón al checkout (no un 404 ni un bloqueo hostil).
- **Notificaciones:** _toasts_ breves para confirmaciones; centro de notificaciones para lo persistente.
- **Límites:** aviso progresivo al 80 % y al 100 % de un límite (asientos, almacenamiento, pipelines).

## 8. Microinteracciones y movimiento

El movimiento confirma causa y efecto; no compite con el contenido.

| Evento | Duración |
|---|---|
| Press | 90 ms |
| Hover | 120 ms |
| Tooltip | 160 ms |
| Panel | 220 ms |
| Modal | 240 ms |
| Skeleton | a partir de > 400 ms de espera |

_Easing_ estándar `cubic-bezier(.2, 0, 0, 1)`. Feedback inmediato; _optimistic UI_ con recuperación en caso de error; animación opcional y breve en gráficos. `prefers-reduced-motion` ⇒ _fade_ en lugar de desplazamiento.

## 9. Marca, logo e iconografía (provisional)

El manual propone un **wordmark limpio «nexo»** (minúsculas, Inter Display semibold) acompañado de un **circuito abierto con nodos** (anagrama): siempre hay una entrada, una salida y espacio para un nuevo módulo. El propio manual indica que es dirección conceptual pendiente de validación y registro. Mientras no haya diseño definitivo:

- **Logo mock** (SVG, `apps/web/public/brand/`): círculo abierto (arco de ~300°) con tres nodos en `purple.700` / `module indigo` / `signal cyan` + wordmark «nexo». Variantes: completo, anagrama solo, monocromo claro y oscuro. Área de respeto = **¼ del diámetro** del símbolo.
- **Iconos:** **Lucide** con `strokeWidth 1.75`, rejilla 20/24 px, _caps_ redondeados, **relleno solo en selección**. Un único componente `<Icon name>` en `@nexo/ui` para poder cambiar el set por el definitivo sin tocar las pantallas.
- **Favicon/PWA:** derivado del anagrama mock (192/512 px, _maskable_).
- Cuando lleguen los activos definitivos: sustituir ficheros en `public/brand/` y el mapa de `<Icon>`; sin cambios de código en las features.

Mock mínimo del símbolo (referencia para generarlo):

```svg
<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
  <path d="M38 14a18 18 0 1 0 4 14" />            <!-- órbita abierta -->
  <circle cx="38" cy="14" r="3.5" fill="#6D28D9" stroke="none"/>
  <circle cx="24" cy="24" r="3.5" fill="#4338CA" stroke="none"/>
  <circle cx="42" cy="28" r="3.5" fill="#0E7490" stroke="none"/>
</svg>
```

Usos **incorrectos:** efectos _glow_, doble acento, negro puro, texto de bajo contraste, estado comunicado solo con color, mayúsculas sostenidas en CTA.

## 10. Implementación y _handoff_

- `packages/design-tokens/tokens.json` con colecciones **Primitives**, **Semantic Light**, **Semantic Dark** y **Components** (compatible con Figma Variables). Un _script_ genera `tokens.css` (`:root` y `[data-theme="dark"]`) y el tema de Tailwind 4.
- **Tailwind 4:** `@theme` expone solo tokens semánticos (`bg-surface`, `text-secondary`, `border-default`, `ring-focus`…); los primitivos no son utilidades. Una regla de lint prohíbe valores `#hex`, `rgb()` y colores de paleta Tailwind en componentes y features.
- **Storybook** documenta cada componente (estados, interacción, responsividad, Light/Dark) y ejecuta `axe` y _visual tests_.
- **QA accesible** automatizada: contraste de tokens, teclado, _screen reader_, `reduced-motion`.
- **Producto por módulo (capa 04):** cada módulo puede definir una pequeña escala de matiz (p. ej. icono/acento de «CRM», «Delivery», «Billing») **sin introducir colores nuevos**: se eligen de la paleta de series o de la escala púrpura/índigo/cian.
- **i18n y diseño:** los componentes toleran textos hasta un +30 % más largos; no se incrustan textos en imágenes.

## 11. Pantallas de referencia (del manual, a replicar)

Panel de ventas (Light y Dark): barra lateral (Inicio · Contactos · Ventas · Actividad · Informes · Ajustes + usuario), cabecera con título, búsqueda y «+ Nueva», KPIs (Pipeline, Conversión, Ciclo medio, Actividad), gráfico «Ingresos previstos», lista «Actividad», tabla «Oportunidades abiertas» (Empresa · Fase · Valor · Próxima acción). Tabla de «Contactos» con avatar de iniciales, empresa, estado (Activo/Prospecto/Riesgo/Inactivo), valor y última actividad. Estas dos pantallas sirven de **criterio de aceptación visual** para el hito 3 (CRM) y 7 (Insights).
