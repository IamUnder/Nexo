/**
 * Reglas de dependencia de Nexo (ARCHITECTURE §3 y §4.2). `pnpm check:boundaries` falla el CI.
 * Objetivo comercial: poder vender cada módulo por separado → los módulos NO se importan entre sí.
 *
 * Para crear una excepción hace falta un ADR aprobado por el usuario (AGENTS.md §8).
 */
const MODULE = "^apps/api/src/modules/([^/]+)/";
const BUSINESS = "(crm|communication|delivery|data-import|insights|onboarding)";

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "error",
      comment: "Las dependencias circulares impiden razonar sobre el aislamiento.",
      from: {},
      to: { circular: true },
    },
    {
      name: "modules-are-isolated",
      severity: "error",
      comment:
        "Un módulo NO importa a otro (ni siquiera tipos). Comunicación: eventos (@nexo/contracts), puertos cableados en composition/ o slots de UI.",
      from: { path: MODULE },
      to: { path: MODULE, pathNot: "^apps/api/src/modules/$1/" },
    },
    {
      name: "kernel-does-not-know-modules",
      severity: "error",
      comment: "platform/ (kernel) es la base común: no puede depender de ningún módulo.",
      from: { path: "^apps/api/src/platform/" },
      to: { path: "^apps/api/src/modules/" },
    },
    {
      name: "no-platform-db-from-business",
      severity: "error",
      comment:
        "El pool de plataforma (BYPASSRLS) solo lo usan identity, tenancy, billing, audit y el dispatcher del outbox (ARCHITECTURE §5.3). Los módulos de negocio acceden solo con withTenant().",
      from: { path: `^apps/api/src/modules/${BUSINESS}/` },
      to: { path: "^apps/api/src/platform/db/platform" },
    },
    {
      name: "domain-is-pure",
      severity: "error",
      comment:
        "domain/ no depende de application, infrastructure, http ni de librerías de infraestructura.",
      from: { path: `${MODULE}domain/` },
      to: {
        path: [
          `${MODULE}(application|infrastructure|http|events|jobs)/`,
          "node_modules/(drizzle-orm|fastify|pg|pg-boss|stripe|resend|googleapis)",
          "^apps/api/src/platform/db/",
        ],
      },
    },
    {
      name: "application-does-not-know-adapters",
      severity: "error",
      comment: "application/ orquesta dominio y puertos; no importa infrastructure/ ni http/.",
      from: { path: `${MODULE}application/` },
      to: { path: `${MODULE}(infrastructure|http)/` },
    },
    {
      name: "infrastructure-and-http-are-independent",
      severity: "error",
      comment:
        "infrastructure/ y http/ importan hacia dentro (application, domain), nunca entre sí.",
      from: { path: `${MODULE}infrastructure/` },
      to: { path: `${MODULE}http/` },
    },
    {
      name: "http-does-not-know-infrastructure",
      severity: "error",
      comment: "http/ llama a casos de uso (application/), no a repositorios.",
      from: { path: `${MODULE}http/` },
      to: { path: `${MODULE}infrastructure/` },
    },
    {
      name: "web-features-are-isolated",
      severity: "error",
      comment:
        "Las features de la web no se importan entre sí; comparten solo @nexo/ui, @nexo/contracts y app/shared.",
      from: { path: "^apps/web/src/features/([^/]+)/" },
      to: { path: "^apps/web/src/features/([^/]+)/", pathNot: "^apps/web/src/features/$1/" },
    },
    {
      name: "web-does-not-import-api",
      severity: "error",
      comment: "La web y la API solo comparten contratos (@nexo/contracts).",
      from: { path: "^apps/web/" },
      to: { path: "^apps/api/" },
    },
    {
      name: "api-does-not-import-web",
      severity: "error",
      from: { path: "^apps/api/" },
      to: { path: "^apps/web/" },
    },
    {
      name: "packages-do-not-import-apps",
      severity: "error",
      comment: "Los paquetes compartidos no dependen de ninguna app.",
      from: { path: "^packages/" },
      to: { path: "^apps/" },
    },
    {
      name: "contracts-stay-light",
      severity: "error",
      comment: "@nexo/contracts solo depende de zod: es el lenguaje común entre front y back.",
      from: { path: "^packages/contracts/src/", pathNot: "\\.test\\.ts$" },
      to: { path: "^packages/(ui|design-tokens|testing)/" },
    },
    {
      name: "not-to-test-from-prod",
      severity: "error",
      comment: "El código de producción no importa código de test.",
      from: { pathNot: "(\\.test\\.|/testing/|/e2e/|^packages/testing/|^tools/)" },
      to: { path: "(\\.test\\.|/testing/|^packages/testing/)" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|coverage|\\.turbo|storybook-static|drizzle)(/|$)" },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default", "types"],
      mainFields: ["module", "main", "types"],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
