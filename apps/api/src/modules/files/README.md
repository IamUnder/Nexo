# Módulo `files` (plataforma)

## Qué hace
Subida y descarga de archivos por **URL firmada** a un almacenamiento S3-compatible. El servidor fija la clave del objeto (`t/<tenant>/…`); el cliente nunca elige la ruta. Aplica la cuota de almacenamiento del plan.

## Entitlement
Siempre activo (la cuota depende del plan).

## Tablas
`files` (tenant, RLS forzada).

## Eventos
Ninguno por ahora.

## Puertos
- **Declara:** `FileStorage` (S3 en producción; memoria en desarrollo y tests) y `StorageLimit`.

## Permisos
`files:file:read|create|delete`.

## Configuración
`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` y, si el navegador no alcanza el endpoint interno, `S3_PUBLIC_ENDPOINT` (ADR 0003).

## Cómo probarlo
`pnpm --filter @nexo/api test -- files`.

## Reglas de aislamiento
No importa ningún otro módulo.
