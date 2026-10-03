import { randomUUID } from "node:crypto";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { ZodError } from "zod";
import type { Env } from "../config/env";
import type { Database } from "../db/database";
import { AppError, toApiError, ValidationError } from "../errors";
import type { Logger } from "../logger";

export interface AppDeps {
  env: Pick<Env, "NODE_ENV" | "NEXO_PUBLIC_URL">;
  logger: Logger;
  database: Pick<Database, "ping">;
  /** `false` desactiva el rate limit (solo tests de integración, que hacen decenas de altas desde una IP). */
  rateLimit?: boolean;
}

/**
 * Construye la app Fastify base. Los módulos registran sus rutas en `composition/` (único sitio que
 * los conoce a todos). Aquí solo viven los plugins de seguridad y los handlers transversales.
 */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    loggerInstance: deps.logger as FastifyBaseLogger,
    genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
    trustProxy: true,
    // Límite de cuerpo conservador; las importaciones usan subida firmada, no el cuerpo JSON.
    bodyLimit: 1_048_576,
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(helmet, {
    // CSP estricta para la API (no sirve HTML); la CSP de la SPA la fija el servidor estático.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
  });
  await app.register(cors, {
    origin: [deps.env.NEXO_PUBLIC_URL],
    credentials: true,
    allowedHeaders: ["authorization", "content-type", "x-request-id", "x-nexo-csrf"],
  });
  await app.register(cookie);
  if (deps.rateLimit !== false) {
    await app.register(rateLimit, { global: true, max: 300, timeWindow: "1 minute" });
  }

  app.addHook("onSend", async (req, reply) => {
    reply.header("x-request-id", req.id);
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError) {
      const mapped = toApiError(new ValidationError("Datos no válidos"), req.id);
      return reply.status(mapped.status).send(mapped.body);
    }
    // Errores de validación de Fastify (esquemas de ruta) y de límite de peticiones.
    const fastifyCode = (error as { code?: string; statusCode?: number }).code;
    const statusCode = (error as { statusCode?: number }).statusCode;
    // Cualquier otro error 4xx de Fastify (JSON mal formado, cuerpo vacío, demasiado grande…) es del cliente.
    const isFastify4xx =
      typeof fastifyCode === "string" &&
      fastifyCode.startsWith("FST_ERR_") &&
      typeof statusCode === "number" &&
      statusCode >= 400 &&
      statusCode < 500;
    if (
      fastifyCode === "FST_ERR_VALIDATION" ||
      fastifyCode === "FST_ERR_CTP_INVALID_MEDIA_TYPE" ||
      isFastify4xx
    ) {
      const mapped = toApiError(new ValidationError("Datos no válidos"), req.id);
      return reply.status(mapped.status).send(mapped.body);
    }
    if (statusCode === 429) {
      return reply.status(429).send({ error: { code: "rate_limit.exceeded", requestId: req.id } });
    }
    if (!(error instanceof AppError)) {
      // Registra el detalle (sin enviarlo al cliente).
      req.log.error({ err: error }, "error no controlado");
    }
    const mapped = toApiError(error, req.id);
    return reply.status(mapped.status).send(mapped.body);
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ error: { code: "resource.not_found", requestId: req.id } }),
  );

  // Liveness: el proceso responde. Readiness: dependencias críticas disponibles.
  app.get("/healthz", async () => ({ status: "ok" }));
  app.get("/readyz", async (_req, reply) => {
    try {
      await deps.database.ping();
      return { status: "ready" };
    } catch (err) {
      app.log.error({ err }, "readiness: base de datos no disponible");
      return reply.status(503).send({ status: "unavailable" });
    }
  });

  return app;
}
