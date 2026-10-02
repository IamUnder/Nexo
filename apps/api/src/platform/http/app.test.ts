import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { LimitExceededError } from "../errors";
import { createLogger } from "../logger";
import { buildApp } from "./app";

const logger = createLogger("silent");
const env = { NODE_ENV: "test" as const, NEXO_PUBLIC_URL: "http://localhost:5173" };

async function app(ping: () => Promise<void> = async () => undefined) {
  const instance = await buildApp({ env, logger, database: { ping } });
  instance.get("/boom", async () => {
    throw new Error("detalle interno: password=secreto");
  });
  instance.get("/limit", async () => {
    throw new LimitExceededError("seats:full", 5);
  });
  instance.post(
    "/echo",
    { schema: { body: z.object({ name: z.string().min(1) }) } },
    async (req) => req.body,
  );
  return instance;
}

let current: Awaited<ReturnType<typeof app>> | undefined;
afterEach(async () => {
  await current?.close();
  current = undefined;
});

describe("app HTTP base", () => {
  it("/healthz responde ok y propaga x-request-id", async () => {
    current = await app();
    const res = await current.inject({ url: "/healthz", headers: { "x-request-id": "abc-123" } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
    expect(res.headers["x-request-id"]).toBe("abc-123");
  });

  it("/readyz devuelve 503 si la base de datos no responde", async () => {
    current = await app(async () => {
      throw new Error("sin conexión");
    });
    const res = await current.inject({ url: "/readyz" });
    expect(res.statusCode).toBe(503);
  });

  it("errores no controlados → 500 sin filtrar detalle interno", async () => {
    current = await app();
    const res = await current.inject({ url: "/boom" });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain("secreto");
    expect(res.json().error.code).toBe("internal.error");
  });

  it("errores de aplicación → código estable y parámetros", async () => {
    current = await app();
    const res = await current.inject({ url: "/limit" });
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toMatchObject({ code: "limit.exceeded", params: { max: 5 } });
  });

  it("validación Zod en el borde → 400 validation.failed", async () => {
    current = await app();
    const res = await current.inject({ method: "POST", url: "/echo", payload: { name: "" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("validation.failed");
  });

  it("rutas inexistentes → 404 uniforme", async () => {
    current = await app();
    const res = await current.inject({ url: "/no-existe" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("resource.not_found");
  });

  it("aplica cabeceras de seguridad", async () => {
    current = await app();
    const res = await current.inject({ url: "/healthz" });
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toContain("default-src 'none'");
  });
});
