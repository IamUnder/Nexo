import { defineConfig } from "vitest/config";

/**
 * Tres proyectos (AGENTS.md §6):
 *  - unit:        dominio y casos de uso, sin I/O.
 *  - integration: PostgreSQL real (Testcontainers).
 *  - isolation:   matriz de aislamiento multitenant. BLOQUEANTE en CI.
 */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts", "src/**/*.iso.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          include: ["src/**/*.int.test.ts"],
          testTimeout: 120_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
      {
        test: {
          name: "isolation",
          include: ["src/**/*.iso.test.ts"],
          testTimeout: 120_000,
          hookTimeout: 180_000,
          fileParallelism: false,
        },
      },
    ],
  },
});
