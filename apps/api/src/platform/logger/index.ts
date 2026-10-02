import { pino } from "pino";

/**
 * Campos que NUNCA deben aparecer en logs (AGENTS.md §5, ARCHITECTURE §14).
 * `redact` es la última línea de defensa: no loguees PII ni secretos aunque estén aquí.
 */
export const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  "password",
  "*.password",
  "token",
  "*.token",
  "accessToken",
  "refreshToken",
  "*.secret",
  "apiKey",
  "*.apiKey",
  "email",
  "*.email",
];

export function createLogger(level: string = "info") {
  return pino({
    level,
    redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
    base: { service: "nexo" },
  });
}

export type Logger = ReturnType<typeof createLogger>;
