#!/bin/sh
# Primer arranque de PostgreSQL (solo si el volumen está vacío): crea los tres roles de Nexo y la base.
# Ver docs/runbooks/db-roles.md. Las contraseñas llegan por entorno (nunca van en el repo).
set -eu

: "${NEXO_OWNER_DB_PASSWORD:?falta NEXO_OWNER_DB_PASSWORD}"
: "${NEXO_APP_DB_PASSWORD:?falta NEXO_APP_DB_PASSWORD}"
: "${NEXO_PLATFORM_DB_PASSWORD:?falta NEXO_PLATFORM_DB_PASSWORD}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_pwd="$NEXO_OWNER_DB_PASSWORD" \
  -v app_pwd="$NEXO_APP_DB_PASSWORD" \
  -v platform_pwd="$NEXO_PLATFORM_DB_PASSWORD" <<'SQL'
CREATE ROLE nexo_owner    LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'owner_pwd';
CREATE ROLE nexo_app      LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD :'app_pwd';
CREATE ROLE nexo_platform LOGIN NOSUPERUSER BYPASSRLS   NOCREATEDB NOCREATEROLE PASSWORD :'platform_pwd';
CREATE DATABASE nexo OWNER nexo_owner;
SQL

# Extensiones que usan las migraciones (las crea un superusuario; el propietario no puede).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname nexo <<'SQL'
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL
