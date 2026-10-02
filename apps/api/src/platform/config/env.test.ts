import { describe, expect, it } from "vitest";
import { parseEnv, parseMigrateEnv } from "./env";

const valid = {
  DATABASE_URL_APP: "postgres://nexo_app:x@localhost:5432/nexo",
  DATABASE_URL_PLATFORM: "postgres://nexo_platform:x@localhost:5432/nexo",
};

describe("parseEnv", () => {
  it("aplica valores por defecto", () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.TENANT_RESOLUTION_MODE).toBe("session");
    expect(env.NODE_ENV).toBe("development");
  });

  it("falla de forma explícita si falta una variable obligatoria", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL_APP/);
  });

  it("rechaza un modo de resolución de tenant desconocido", () => {
    expect(() => parseEnv({ ...valid, TENANT_RESOLUTION_MODE: "wildcard" })).toThrow();
  });
});

describe("parseMigrateEnv", () => {
  it("exige la URL del propietario", () => {
    expect(() => parseMigrateEnv({})).toThrow(/DATABASE_URL_OWNER/);
  });

  it("exige contraseñas de al menos 8 caracteres", () => {
    expect(() =>
      parseMigrateEnv({
        DATABASE_URL_OWNER: valid.DATABASE_URL_APP,
        NEXO_APP_DB_PASSWORD: "corta",
      }),
    ).toThrow();
  });
});
