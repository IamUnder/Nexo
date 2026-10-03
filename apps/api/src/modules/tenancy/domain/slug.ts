/**
 * Slug de un tenant: apto como etiqueta DNS (3-40 caracteres: minúsculas, dígitos y guiones), único e
 * INMUTABLE (ARCHITECTURE §6). Hoy se usa para URLs de invitación y logs; mañana, para subdominios.
 * Dominio puro: sin I/O ni dependencias de infraestructura.
 */
export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

/** Slugs no asignables a tenants (ver también `RESERVED_SLUGS` del kernel; aquí se duplican a propósito). */
export const RESERVED = new Set([
  "app",
  "api",
  "www",
  "admin",
  "demo",
  "status",
  "docs",
  "mail",
  "static",
  "assets",
  "billing",
  "support",
  "nexo",
  "login",
  "signup",
]);

export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 34)
    .replace(/-+$/g, "");
  if (base.length === 0) return "empresa"; // el nombre no tenía letras ni dígitos
  return base.length >= 3 ? base : `${base}-co`;
}

export function isAssignableSlug(slug: string): boolean {
  return SLUG_PATTERN.test(slug) && !RESERVED.has(slug);
}

/**
 * Devuelve un slug libre a partir del nombre: `acme`, `acme-2`, `acme-3`… y, si hay muchos choques,
 * un sufijo aleatorio. `exists` consulta la unicidad (la BD la garantiza igualmente con UNIQUE).
 */
export async function generateUniqueSlug(
  name: string,
  exists: (slug: string) => Promise<boolean>,
  random: () => string = () => Math.random().toString(36).slice(2, 7),
): Promise<string> {
  let base = slugify(name);
  if (RESERVED.has(base)) base = `${base}-co`;
  for (let i = 1; i <= 20; i++) {
    const candidate = i === 1 ? base : `${base.slice(0, 36)}-${i}`;
    if (isAssignableSlug(candidate) && !(await exists(candidate))) return candidate;
  }
  return `${base.slice(0, 33)}-${random()}`;
}
