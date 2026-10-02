import { Writable } from "node:stream";
import { pino } from "pino";
import { describe, expect, it } from "vitest";
import { REDACTED_PATHS } from "./index";

/** Captura lo que escribiría el logger para comprobar que los secretos no salen. */
function capture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const logger = pino({ redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" } }, stream);
  return { logger, lines };
}

describe("logger · redacción de datos sensibles", () => {
  it("oculta contraseñas, tokens, cabeceras de autenticación y emails", () => {
    const { logger, lines } = capture();
    logger.info({
      password: "p4ss",
      user: { email: "a@b.com", password: "p4ss2", token: "tok-secreto-123" },
      req: { headers: { authorization: "Bearer abc", cookie: "sid=1" } },
      accessToken: "at",
    });
    const out = lines.join("");
    for (const secret of ["p4ss", "a@b.com", "tok-secreto-123", "Bearer abc", "sid=1", '"at"']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain("[REDACTED]");
  });
});
