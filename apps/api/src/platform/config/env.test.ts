import { describe, expect, it } from "vitest";
import { parseEnv, parseMigrateEnv, parseSigningKeys } from "./env";

const valid = {
  DATABASE_URL_APP: "postgres://nexo_app:x@localhost:5432/nexo",
  DATABASE_URL_PLATFORM: "postgres://nexo_platform:x@localhost:5432/nexo",
  JWT_SIGNING_KEYS: "k1:0123456789abcdef0123456789abcdef0123",
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

describe("claves de firma JWT", () => {
  it("la primera firma y todas validan (rotación)", () => {
    const keys = parseSigningKeys("nueva:" + "n".repeat(32) + ",vieja:" + "v".repeat(32));
    expect(keys.current.kid).toBe("nueva");
    expect([...keys.all.keys()]).toEqual(["nueva", "vieja"]);
  });

  it("rechaza secretos cortos y formatos erróneos", () => {
    expect(() => parseSigningKeys("k1:corto")).toThrow(/32/);
    expect(() => parseSigningKeys("sin-separador")).toThrow(/formato/);
    expect(() => parseSigningKeys("")).toThrow();
  });

  it("parseEnv falla si faltan o son inválidas, y exige dominio base en modo subdomain", () => {
    expect(() => parseEnv({ ...valid, JWT_SIGNING_KEYS: "k1:corto" })).toThrow(/32/);
    expect(() => parseEnv({ ...valid, TENANT_RESOLUTION_MODE: "subdomain" })).toThrow(
      /NEXO_BASE_DOMAIN/,
    );
    expect(
      parseEnv({ ...valid, TENANT_RESOLUTION_MODE: "subdomain", NEXO_BASE_DOMAIN: "nexo.test" })
        .NEXO_BASE_DOMAIN,
    ).toBe("nexo.test");
  });

  it("una variable vacía cuenta como no definida (compose inyecta cadenas vacías)", () => {
    const env = parseEnv({ ...valid, S3_PUBLIC_ENDPOINT: "", SMTP_URL: "" });
    expect(env.S3_PUBLIC_ENDPOINT).toBeUndefined();
    expect(env.SMTP_URL).toBeUndefined();
  });
});
