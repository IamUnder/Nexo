import { defineConfig } from "drizzle-kit";

// Las migraciones se generan con `pnpm db:generate` y se aplican con `pnpm db:migrate` (rol propietario).
// Cada módulo aporta su esquema en `modules/<m>/infrastructure/schema.ts` (prefijo de tabla propio).
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/platform/db/schema.ts", "./src/modules/*/infrastructure/schema.ts"],
  out: "./drizzle",
  casing: "snake_case",
  strict: true,
  verbose: true,
});
