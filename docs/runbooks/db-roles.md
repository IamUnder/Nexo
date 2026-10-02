# Runbook · Roles de base de datos

Nexo usa tres roles (ARCHITECTURE §5.2). La migración `0000_roles_and_helpers.sql` los crea si el rol que migra tiene permiso; si no, un administrador debe crearlos **una vez** antes del primer `migrate`.

| Rol | Atributos | Uso |
|---|---|---|
| `nexo_owner` | Propietario del esquema, con DDL. Es la conexión de `DATABASE_URL_OWNER`. | Solo el proceso `migrate`. |
| `nexo_app` | `LOGIN NOSUPERUSER NOBYPASSRLS` | Pool de aplicación (`DATABASE_URL_APP`). **La RLS siempre aplica.** |
| `nexo_platform` | `LOGIN NOSUPERUSER BYPASSRLS` | Pool de plataforma (`DATABASE_URL_PLATFORM`): login, webhooks, outbox, superadmin. |

## Si el propietario no puede crear roles (PaaS sin CREATEROLE)

Con un usuario administrador, una sola vez:

```sql
CREATE ROLE nexo_app      LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE nexo_platform LOGIN NOSUPERUSER BYPASSRLS   NOCREATEDB NOCREATEROLE;
-- (crear BYPASSRLS exige superusuario en PostgreSQL)
```

Después ejecutar `migrate` con `NEXO_APP_DB_PASSWORD` y `NEXO_PLATFORM_DB_PASSWORD` definidas: la migración verifica que existen y `migrate` les aplica la contraseña con `ALTER ROLE`.

## Verificación

```bash
pnpm db:check-rls   # audita RLS, políticas, índices y FK de todas las tablas + que nexo_app no tiene BYPASSRLS
```

Cualquier resultado distinto de «RLS OK» es un **incidente de seguridad** hasta demostrar lo contrario.

## Reglas

- `nexo_app` jamás debe tener `BYPASSRLS` ni ser propietario de tablas (el meta-test `auditRls` falla si lo tiene).
- Las contraseñas viven solo en variables de entorno / gestor de secretos del PaaS. Rotación: `ALTER ROLE ... PASSWORD`, actualizar la variable y reiniciar `api`/`worker`.
- El pool de plataforma solo se usa desde módulos autorizados (`dependency-cruiser`, regla `no-platform-db-from-business`).
