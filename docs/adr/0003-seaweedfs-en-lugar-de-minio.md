# ADR 0003 · SeaweedFS en lugar de MinIO como S3 autoalojado

- Estado: aceptada (2026-10-03)

## Contexto

La arquitectura prevé almacenamiento S3-compatible (OD-01). Para desarrollo y para el despliegue autocontenido se pensó en MinIO, pero al intentar usarlo (2026-10-03) `minio/minio` en Docker Hub y `quay.io/minio/minio` ya no se pueden descargar sin autenticación: el proyecto dejó de publicar imágenes comunitarias.

## Decisión

Usar **SeaweedFS** (`chrislusf/seaweedfs`, Apache-2.0, imagen pública) como S3 autoalojado en `docker-compose.yml` (dev) y `deploy/docker-compose.prod.yml`. El código no cambia: solo habla S3 (`@aws-sdk/client-s3`) a través del puerto `FileStorage`; cualquier proveedor S3 (Cloudflare R2, Scaleway, Backblaze, AWS) sirve cambiando `S3_*`.

## Consecuencias

- Las URLs prefirmadas que usa el navegador deben firmarse con un endpoint alcanzable desde fuera: nueva variable opcional `S3_PUBLIC_ENDPOINT` (si difiere de `S3_ENDPOINT`).
- El bucket se crea con `weed shell` (`s3-init` en el compose de producción).
- Si Portledger ofrece almacenamiento S3 propio, se usa ese y se omite el servicio `s3`.
