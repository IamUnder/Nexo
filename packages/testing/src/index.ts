import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { Wait } from "testcontainers";

/** Contraseñas de los roles de login SOLO para tests (nunca valores reales). */
export const TEST_APP_PASSWORD = "test-app-password";
export const TEST_PLATFORM_PASSWORD = "test-platform-password";

export interface TestDatabase {
  /** Rol propietario (superusuario del contenedor): migraciones y preparación de datos. */
  ownerUrl: string;
  /** Rol `nexo_app` (sin BYPASSRLS). Existe tras ejecutar las migraciones. */
  appUrl: string;
  /** Rol `nexo_platform` (BYPASSRLS). Existe tras ejecutar las migraciones. */
  platformUrl: string;
  /** Pool del propietario para preparar/inspeccionar datos en tests. */
  ownerPool: Pool;
  stop(): Promise<void>;
}

/**
 * Arranca un PostgreSQL REAL en un contenedor (no se mockea la base de datos; AGENTS.md §6).
 * Las migraciones las aplica el test llamando a `runMigrations` de `apps/api` con las
 * contraseñas de este módulo, para no crear una dependencia circular.
 *
 * Funciona con Docker y con Podman (que expone la API de Docker): en Windows desactiva Ryuk,
 * que no es compatible con el socket de Podman.
 */
export async function startTestDatabase(image = "postgres:18-alpine"): Promise<TestDatabase> {
  if (process.platform === "win32" && process.env.TESTCONTAINERS_RYUK_DISABLED === undefined) {
    process.env.TESTCONTAINERS_RYUK_DISABLED = "true";
  }
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(image)
    .withUsername("nexo_owner")
    .withPassword("owner-test-password")
    .withDatabase("nexo")
    // Espera por log en vez de la comprobación del puerto interno: esta última usa `exec` dentro del
    // contenedor y se queda colgada con Podman. El log "ready" (2 veces: init + arranque real) basta.
    .withWaitStrategy(Wait.forLogMessage(/database system is ready to accept connections/, 2))
    .start();

  const host = container.getHost();
  const port = container.getPort();
  const url = (user: string, password: string) =>
    `postgres://${user}:${password}@${host}:${port}/nexo`;

  const ownerUrl = url("nexo_owner", "owner-test-password");
  const ownerPool = new Pool({ connectionString: ownerUrl, max: 4 });

  return {
    ownerUrl,
    appUrl: url("nexo_app", TEST_APP_PASSWORD),
    platformUrl: url("nexo_platform", TEST_PLATFORM_PASSWORD),
    ownerPool,
    async stop() {
      await ownerPool.end();
      await container.stop();
    },
  };
}
