# Runbook · Despliegue de Nexo

Estado: **verificado a mano con Podman** el 2026-10-03 (imágenes reales, PostgreSQL 18 con los tres roles, SeaweedFS, Mailpit): `migrate → seed → api + worker → web`, alta, CRM completo y proxy `/api` OK. El `compose` en sí no se ha podido ejecutar en la máquina de desarrollo (no hay `docker compose`/`podman compose`), por lo que **la primera vez conviene vigilar el arranque**.

## Qué hay que desplegar

| Servicio | Imagen (`docker/`) | Comando | Notas |
|---|---|---|---|
| `postgres` | `postgres:18-alpine` + `deploy/initdb/01-roles.sh` | — | Crea roles `nexo_owner`/`nexo_app`/`nexo_platform` (este último `BYPASSRLS`) y la base `nexo`. Solo corre con el volumen vacío. |
| `s3` + `s3-init` | `chrislusf/seaweedfs` | — | Opcional si hay otro S3 (ADR 0003). |
| `migrate` | `Dockerfile.api` | `node dist/migrate.js` | One-shot. Con `DATABASE_URL_OWNER`. Aplica migraciones **y crea las colas de pg-boss**. |
| `seed` | `Dockerfile.api` | `node dist/seed.js` | One-shot idempotente. Crea el superadmin con `SUPERADMIN_BOOTSTRAP_*`. |
| `api` | `Dockerfile.api` | `node dist/api.js` | Puerto 4000. `/healthz` (vivo), `/readyz` (BD). |
| `worker` | `Dockerfile.api` | `node dist/worker.js` | Outbox, suscriptores, correos. **Una réplica por ahora.** |
| `web` | `Dockerfile.web` | Caddy | Puerto 8080: sirve la SPA y hace proxy de `/api/*` → `api:4000`. Es lo único que se expone. |

Todo en `deploy/docker-compose.prod.yml` (contexto de build = raíz del repo).

## Primera vez

```bash
cp deploy/.env.prod.example deploy/.env      # rellena TODOS los secretos
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.prod.yml logs -f api worker
```

1. **Dominio y TLS**: poner delante un proxy/túnel con TLS (Traefik, Cloudflare Tunnel…) hacia `http://<WEB_ALIAS>:8080`: `web` no publica puertos y se une a la red propia `TUNNEL_NETWORK` con ese alias (el operador conecta el túnel a esa red). Límites de memoria previstos (`mem_limit`): postgres 512m, s3 384m, api 384m, worker 256m, web 96m, migrate/seed 256m puntuales (≈1,6 GB en reposo como techo; el consumo real de SeaweedFS en reposo no está medido). `NEXO_PUBLIC_URL` debe ser exactamente el origen público (`https://nexo.kaizogroup.es`): la API valida `Origin` contra él y marca las cookies como `Secure`.
2. **Correo (imprescindible)**: sin SMTP real nadie puede confirmar su email, y sin email confirmado no se puede invitar. Rellena `SMTP_URL` (p. ej. `smtps://usuario:clave@smtp.proveedor.com:465`) y `EMAIL_FROM_SYSTEM`. Solo para una prueba rápida: `--profile mail-sandbox` + `SMTP_URL=smtp://mailpit:1025`; la bandeja queda en `127.0.0.1:8025` del host (túnel SSH) — **nunca** exponerla.
3. **Superadmin**: entra en `/admin/login` con `SUPERADMIN_BOOTSTRAP_EMAIL/PASSWORD`; después elimina esas dos variables.
4. **Secretos**: `JWT_SIGNING_KEYS` (`kid:secreto`, ≥ 32 car.; rotación: añadir la nueva delante), contraseñas de BD, S3.

## Tenant demo

Un tenant «Nexo Demo» activo (sin caducidad de prueba) con los datos de ejemplo, para enseñar el producto. Idempotente; define `DEMO_ADMIN_EMAIL` y `DEMO_ADMIN_PASSWORD` (≥ 12 caracteres, que no contenga el email) y ejecuta una vez desplegado:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env run --rm -e DEMO_ADMIN_EMAIL=... -e DEMO_ADMIN_PASSWORD=... api node dist/seed-demo.js
# Volver a dejarlo como al principio (quita y recarga solo lo de ejemplo; no toca las credenciales):
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env run --rm -e DEMO_ADMIN_EMAIL=... -e DEMO_ADMIN_PASSWORD=... api node dist/reset-demo.js
```

## Actualizaciones

`up -d --build` reconstruye y vuelve a ejecutar `migrate` y `seed` (idempotentes) antes de `api`/`worker`. Las migraciones son solo hacia adelante y compatibles hacia atrás: el rollback de código es seguro; el de esquema no existe (ARCHITECTURE §5.6).

## Verificación posterior

```bash
docker compose -f deploy/docker-compose.prod.yml exec api node -e "fetch('http://127.0.0.1:4000/readyz').then(r=>console.log(r.status))"
```

Desde fuera: `https://nexo.kaizogroup.es/healthz` → `ok`; `/api/v1/session/me` sin sesión → 401. Auditoría de RLS (como propietario): `pnpm db:check-rls`.

## Backups

El único estado es el volumen de PostgreSQL (`pgdata`) y el de S3 (`s3data`). Mínimo recomendado: `pg_dump -U postgres nexo` diario fuera del host. Nada de esto está automatizado todavía.

## Si el entorno es un PaaS con Postgres gestionado

Seguir `docs/runbooks/db-roles.md`: crear los tres roles a mano (el rol propietario no puede, ni debe, tener `CREATEROLE`), dar `NEXO_APP_DB_PASSWORD` etc. directamente en las URLs y **no** pasar las contraseñas a `migrate`.
