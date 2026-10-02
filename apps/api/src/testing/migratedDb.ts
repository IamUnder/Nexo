import {
  startTestDatabase,
  TEST_APP_PASSWORD,
  TEST_PLATFORM_PASSWORD,
  type TestDatabase,
} from "@nexo/testing";
import { runMigrations } from "../migrate";
import { Database } from "../platform/db/database";

export interface MigratedDb {
  raw: TestDatabase;
  /** `maxConnections` pequeño a propósito en algunos tests para forzar reutilización de conexión. */
  database(options?: { maxConnections?: number }): Database;
  stop(): Promise<void>;
}

/** PostgreSQL real, con TODAS las migraciones aplicadas y los roles de login creados. */
export async function setupMigratedDb(options: { queues?: string[] } = {}): Promise<MigratedDb> {
  const raw = await startTestDatabase();
  await runMigrations({
    ownerUrl: raw.ownerUrl,
    appPassword: TEST_APP_PASSWORD,
    platformPassword: TEST_PLATFORM_PASSWORD,
    queues: options.queues ?? [],
  });
  const opened: Database[] = [];
  return {
    raw,
    database(options) {
      const db = new Database({
        appUrl: raw.appUrl,
        platformUrl: raw.platformUrl,
        ...(options?.maxConnections ? { maxConnections: options.maxConnections } : {}),
      });
      opened.push(db);
      return db;
    },
    async stop() {
      await Promise.all(opened.map((d) => d.close()));
      await raw.stop();
    },
  };
}
