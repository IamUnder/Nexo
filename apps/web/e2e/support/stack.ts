import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { startTestDatabase, TEST_APP_PASSWORD, TEST_PLATFORM_PASSWORD } from "@nexo/testing";
import { GenericContainer, Wait } from "testcontainers";

/**
 * PILA REAL para los E2E: PostgreSQL 18 y Mailpit en contenedores, migraciones y seed reales, y los
 * procesos `api` + `worker` de verdad. Nada se mockea: el correo de invitación/verificación se lee de la
 * bandeja de Mailpit, igual que lo haría una persona.
 */
export const E2E = {
  apiPort: 4100,
  webPort: 5174,
  adminEmail: "admin-e2e@nexo.test",
  adminPassword: "una contraseña de superadmin larga 2026",
};

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "../../../..");
const children: ChildProcess[] = [];

function killTree(child: ChildProcess) {
  if (!child.pid) return;
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
  else child.kill("SIGTERM");
}

function run(cmd: string, args: string[], env: Record<string, string>) {
  const res = spawnSync(cmd, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    shell: true,
    encoding: "utf8",
  });
  if (res.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")} falló:\n${res.stdout}\n${res.stderr}`);
}

async function waitFor(url: string, timeoutMs = 60_000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {
      /* aún arrancando */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timeout esperando ${url}`);
}

export interface Stack {
  mailpitApi: string;
  stop(): Promise<void>;
}

export async function startStack(): Promise<Stack> {
  const db = await startTestDatabase();
  const mailpit = await new GenericContainer("axllent/mailpit:latest")
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forLogMessage(/accessible via/))
    .start();
  const smtpUrl = `smtp://${mailpit.getHost()}:${mailpit.getMappedPort(1025)}`;
  const mailpitApi = `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}`;

  const env: Record<string, string> = {
    NODE_ENV: "development",
    LOG_LEVEL: "warn",
    RATE_LIMIT_DISABLED: "true",
    PORT: String(E2E.apiPort),
    NEXO_PUBLIC_URL: `http://localhost:${E2E.webPort}`,
    DATABASE_URL_OWNER: db.ownerUrl,
    DATABASE_URL_APP: db.appUrl,
    DATABASE_URL_PLATFORM: db.platformUrl,
    NEXO_APP_DB_PASSWORD: TEST_APP_PASSWORD,
    NEXO_PLATFORM_DB_PASSWORD: TEST_PLATFORM_PASSWORD,
    JWT_SIGNING_KEYS: "e2e:0123456789abcdef0123456789abcdef0123456789",
    SMTP_URL: smtpUrl,
    EMAIL_FROM_SYSTEM: "Nexo <e2e@nexo.test>",
    SUPERADMIN_BOOTSTRAP_EMAIL: E2E.adminEmail,
    SUPERADMIN_BOOTSTRAP_PASSWORD: E2E.adminPassword,
  };

  run("pnpm", ["--filter", "@nexo/api", "db:migrate"], env);
  run("pnpm", ["--filter", "@nexo/api", "db:seed"], env);

  const spawnDev = (args: string[], extra: Record<string, string> = {}) => {
    const child = spawn("pnpm", args, {
      cwd: repoRoot,
      env: { ...process.env, ...env, ...extra },
      shell: true,
      stdio: "ignore",
    });
    children.push(child);
    return child;
  };
  spawnDev(["--filter", "@nexo/api", "exec", "tsx", "src/api.ts"]);
  spawnDev(["--filter", "@nexo/api", "exec", "tsx", "src/worker.ts"]);
  await waitFor(`http://localhost:${E2E.apiPort}/readyz`);

  return {
    mailpitApi,
    async stop() {
      for (const c of children) killTree(c);
      await mailpit.stop();
      await db.stop();
    },
  };
}
