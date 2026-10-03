import { defineConfig, devices } from "@playwright/test";

/**
 * E2E de flujos críticos contra la PILA REAL (ver e2e/support/stack.ts): PostgreSQL + Mailpit en
 * contenedores, `api` y `worker` reales y la web en modo desarrollo con proxy a esa API.
 * Requiere Docker o Podman en marcha (`podman machine start` en Windows).
 */
const WEB_PORT = 5174;
const API_PORT = 4100;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  globalSetup: "./e2e/support/globalSetup.ts",
  // Los tests comparten una BD; cada uno crea sus propios datos con emails únicos.
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: "on-first-retry", locale: "es-ES" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
    url: `http://localhost:${WEB_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NEXO_API_PROXY: `http://localhost:${API_PORT}` },
  },
});
