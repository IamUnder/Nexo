import { randomBytes } from "node:crypto";

/**
 * UUID v7 (RFC 9562): 48 bits de milisegundos + aleatorio. Ordenable en el tiempo → mejor localidad
 * de índices, y sirve de clave de idempotencia para eventos. Las PK de tabla usan `uuidv7()` de
 * PostgreSQL 18; esto es para ids generados en la aplicación (eventos, tokens de fila).
 */
export function uuidv7(now: number = Date.now()): string {
  const bytes = randomBytes(16);
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70; // versión 7
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80; // variante RFC 4122
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
