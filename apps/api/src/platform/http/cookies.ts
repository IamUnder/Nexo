import type { FastifyReply, FastifyRequest } from "fastify";

/**
 * Cookies de refresh (ARCHITECTURE §7.3). `httpOnly` + `SameSite=Strict` + ruta acotada; `Secure` en
 * producción. Hay una por ámbito: usuarios de tenant y superadmin NO comparten cookie.
 */
export const REFRESH_COOKIE = {
  tenant: { name: "nexo_rt", path: "/api/v1/auth" },
  platform: { name: "nexo_pt", path: "/api/v1/admin/auth" },
} as const;

/** Cabecera que el cliente debe enviar al refrescar: bloquea CSRF (un formulario ajeno no puede ponerla). */
export const CSRF_HEADER = "x-nexo-csrf";

export type RefreshScope = keyof typeof REFRESH_COOKIE;

export function setRefreshCookie(
  reply: FastifyReply,
  scope: RefreshScope,
  token: string,
  expires: Date,
  secure: boolean,
): void {
  const { name, path } = REFRESH_COOKIE[scope];
  reply.setCookie(name, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path,
    expires,
  });
}

export function clearRefreshCookie(
  reply: FastifyReply,
  scope: RefreshScope,
  secure: boolean,
): void {
  const { name, path } = REFRESH_COOKIE[scope];
  reply.clearCookie(name, { httpOnly: true, secure, sameSite: "strict", path });
}

export function readRefreshCookie(req: FastifyRequest, scope: RefreshScope): string | undefined {
  return req.cookies[REFRESH_COOKIE[scope].name];
}

/** Para endpoints con cookie: exige la cabecera anti-CSRF y que el Origin (si viene) sea el permitido. */
export function assertSameSiteRequest(req: FastifyRequest, allowedOrigin: string): boolean {
  if (req.headers[CSRF_HEADER] !== "1") return false;
  const origin = req.headers.origin;
  return origin === undefined || origin === allowedOrigin;
}
