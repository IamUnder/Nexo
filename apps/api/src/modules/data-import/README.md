# Módulo `data-import`

## Qué hace
Importación guiada de **empresas y contactos** desde CSV (el navegador lo lee y separa, detecta `;`/`,` y Windows-1252) y exportación completa en CSV. Pipeline: mapear → validar y normalizar → deduplicar → **simular (dry run, sin escribir)** → ejecutar en segundo plano con checkpoint por fila (reanudable) → **rollback** del lote. Referencia: MODULES_SPEC §6.

## Entitlement
`module:data_import` (Core). La exportación funciona incluso con el tenant bloqueado (portabilidad).

## Tablas (prefijo `import_`)
`import_batches`, `import_rows` (fila cruda + normalizada + estado + errores), `import_items` (qué creó o actualizó, con el valor anterior para deshacer). RLS forzada (`0011`). Sin FK hacia el CRM.

## Eventos
- **Emite:** `import.batch.completed|failed|rolled_back`.
- **Consume:** ninguno.

## Puertos
- **Declara:** `ImportTarget` (`lookup`, `resolveCompany`, `create`, `fillEmpty`, `revertFill`, `remove`, `exportPage`). Lo cumple, por estructura, el `CrmImportAdapter` del módulo `crm`; se conectan en `composition/services.ts`.

## Permisos
`import:batch:read|create|rollback`, `import:data:export` (manager y admin; no comerciales).

## Reglas
- Duplicados: empresas por NIF normalizado o nombre sin tildes; contactos por email. Política por lote: **omitir** o **completar solo campos vacíos** (nunca pisa datos del usuario).
- Filas repetidas dentro del fichero se omiten; las inválidas se rechazan con motivo y se pueden descargar.
- Máximo 5.000 filas por lote. Las escrituras usan los casos de uso reales del CRM (eventos y auditoría) con origen `import`.
- Rollback: ventana de 30 días; lo creado se borra (lógico) y lo completado se vacía de nuevo. Si el usuario ya usó un registro (p. ej. le colgó una oportunidad) se conserva y se avisa (`kept`).
- Un lote «en ejecución» huérfano (el proceso cayó) se puede reanudar tras 10 minutos: las filas ya importadas no se repiten.

## Pendiente
XLSX, oportunidades (`deals`), mapeos guardados como plantilla, revisión manual de coincidencias dudosas (dedupe aproximado), ejecución por job de pg-boss con límite mayor.

## Cómo probarlo
`pnpm --filter @nexo/api test -- data-import` (unitarios de normalización + 12 de integración con PostgreSQL real).

## Reglas de aislamiento
No importa ningún otro módulo (`pnpm check:boundaries`).
