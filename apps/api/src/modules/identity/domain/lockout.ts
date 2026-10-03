/**
 * Bloqueo progresivo de cuentas ante contraseñas incorrectas (ARCHITECTURE §7.3). Complementa al
 * rate limit por IP: este protege la CUENTA frente a ataques distribuidos.
 */
export const MAX_FAILED_LOGINS = 5;
const BASE_LOCK_MINUTES = 15;
const MAX_LOCK_MINUTES = 24 * 60;

export function isLocked(lockedUntil: Date | null, now: Date): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

/**
 * Tras `failedLogins` fallos consecutivos devuelve el instante de desbloqueo (o null si aún no toca).
 * 5 fallos → 15 min; cada fallo extra duplica el bloqueo (30, 60, 120… hasta 24 h).
 */
export function lockUntilAfterFailure(failedLogins: number, now: Date): Date | null {
  if (failedLogins < MAX_FAILED_LOGINS) return null;
  const extra = failedLogins - MAX_FAILED_LOGINS;
  const minutes = Math.min(BASE_LOCK_MINUTES * 2 ** extra, MAX_LOCK_MINUTES);
  return new Date(now.getTime() + minutes * 60_000);
}

/**
 * Tolerancia ante la reutilización de un refresh token recién rotado (ARCHITECTURE §7.3).
 *
 * Con rotación estricta, si el usuario recarga la página mientras se está renovando la sesión, la
 * respuesta con el token nuevo se pierde pero el servidor ya rotó el viejo: la siguiente petición
 * presentaría un token «ya usado» y parecería un robo (se revocaría la familia y se cerraría la sesión
 * sin motivo). Dentro de esta ventana corta se acepta la reutilización y se emite un sucesor nuevo;
 * pasada la ventana, un token rotado sigue interpretándose como robo y revoca TODA la familia.
 */
export const REFRESH_REUSE_LEEWAY_MS = 10_000;

export function isWithinReuseLeeway(rotatedAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - rotatedAt.getTime();
  return elapsed >= 0 && elapsed <= REFRESH_REUSE_LEEWAY_MS;
}
