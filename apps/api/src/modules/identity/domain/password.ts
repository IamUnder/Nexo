/**
 * Política de contraseñas (MODULES_SPEC §2.2): ≥ 12 caracteres, que no sea una de las más comunes y
 * que no contenga el email ni el nombre de la persona. La política que MANDA es esta (servidor); el
 * cliente solo adelanta la validación de longitud. Devuelve `null` si es válida o el código del fallo.
 */
export const PASSWORD_MIN_LENGTH = 12;

export type PasswordProblem = "too_short" | "too_common" | "contains_identity" | "too_repetitive";

/** Muestra de contraseñas muy usadas (en minúsculas). No pretende ser exhaustiva: es una red mínima. */
const COMMON = new Set([
  "123456789012",
  "password1234",
  "contraseña123",
  "contrasena123",
  "qwertyuiop12",
  "qwerty123456",
  "iloveyou1234",
  "administrator",
  "welcome12345",
  "letmein12345",
  "passw0rd1234",
  "123456123456",
  "abc123456789",
  "nexo12345678",
  "1q2w3e4r5t6y",
  "password12345",
  "contraseña1234",
  "contrasena1234",
  "changeme1234",
  "monkey123456",
]);

export function checkPassword(
  password: string,
  identity: { email?: string | undefined; fullName?: string | undefined } = {},
): PasswordProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "too_short";
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) return "too_common";
  if (new Set(lower).size <= 3) return "too_repetitive"; // «aaaaaaaaaaaa», «abababababab»

  const local = identity.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lower.includes(local)) return "contains_identity";
  for (const part of (identity.fullName ?? "").toLowerCase().split(/\s+/)) {
    if (part.length >= 4 && lower.includes(part)) return "contains_identity";
  }
  return null;
}
