# Preguntas pendientes para Portledger (OD-05)

Estado al 2026-10-03: **sin respuesta**. La sesión «Portledger» corre en el servidor remoto del usuario y no era alcanzable por mensajería desde la sesión de Nexo (`ListAgents` no la mostraba). Para cerrar la decisión, el usuario debe abrir/conectar esa sesión y reenviarle estas preguntas (o responderlas él).

> Pistas halladas en el historial de esa sesión (**sin verificar**): el PaaS corre en Docker con Traefik, red `kaizen-net` y túnel de Cloudflare para internet; hay Postgres en contenedores. Las despliegues de otras apps se hacen con `docker-compose` en `/home/under`.

1. **Modelo de despliegue:** ¿desde repo Git (¿cuál y cómo se da acceso?), desde imágenes de un registro o desde carpeta/compose? ¿Qué debo entregar exactamente y quién construye las imágenes?
2. **Varios servicios por app:** `api` + `worker` + `web` + un servicio one-shot `migrate` que corra antes de arrancar (equivalente a `depends_on: service_completed_successfully`). ¿Cómo se declara?
3. **PostgreSQL:** ¿versión disponible (necesito ≥ 17, ideal 18)? ¿Puedo crear los roles `nexo_owner`, `nexo_app`, `nexo_platform` (con `BYPASSRLS`; ver `db-roles.md`) y las extensiones `pg_trgm`, `unaccent`, `pgcrypto`? ¿Hay pooler (PgBouncer) y en qué modo? ¿Backups: quién, frecuencia y cómo se restaura?
4. **Object storage S3-compatible:** ¿existe (MinIO u otro) o uso uno externo? ¿Región UE?
5. **Dominio y TLS:** ¿qué dominio/subdominio usará Nexo? ¿TLS automático? ¿Dominio propio más adelante? ¿Posible wildcard DNS a futuro (para subdominio por tenant)? (Con Cloudflare Tunnel suele ser viable: confirmar.)
6. **Secretos y variables:** ¿cómo se inyectan por servicio y cómo se rotan? ¿Se pueden marcar como secretos?
7. **Salud, logs y recursos:** endpoints de liveness/readiness (`/healthz`, `/readyz`), dónde se ven los logs, límites de CPU/RAM, escalado horizontal de `api`/`worker`.
8. **Red saliente y webhooks:** puertos 443/587/465 permitidos; recepción de webhooks públicos (Stripe/Resend) en rutas de `api`.
9. **Releases:** rollback, downtime al desplegar, hooks pre/post despliegue.
10. **Convenciones:** nombres de proyecto, labels, estructura de carpetas, límites de tamaño de imagen; y qué avisar antes de cada despliegue.

Artefactos listos para entregar cuando se acuerde el contrato: `docker/Dockerfile.api` (api/worker/migrate; verificado con Podman), `docker/Dockerfile.web` + `docker/Caddyfile`, `docker-compose.yml` (solo dev; hay que escribir el de producción según las respuestas) y `.env.example`.
