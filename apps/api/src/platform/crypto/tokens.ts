import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Tokens opacos de un solo uso (refresh, invitaciones, recuperación de contraseña, verificación).
 * En base de datos se guarda SOLO el hash SHA-256: un volcado de la tabla no permite usarlos.
 * 32 bytes de entropía → no hace falta un hash lento (no son contraseñas elegidas por personas).
 */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Comparación en tiempo constante de dos cadenas (evita fugas por tiempo). */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
