/**
 * Resolución de tenant ANTES de autenticar (ARCHITECTURE §6).
 *
 * - `session` (actual): el PaaS no soporta wildcard DNS → el tenant se decide tras el login
 *   (selector de empresa si el email tiene varias membresías). Aquí devuelve null.
 * - `subdomain` (preparado): `cliente.nexo…` → tenant por el `Host`.
 *
 * El JWT siempre lleva `tid`, así que la API no depende del Host para autorizar; cambiar de modo
 * no toca rutas, RLS ni datos.
 */
export interface TenantResolver {
  /** Devuelve el slug del tenant deducido de la petición, o null si aún no se puede saber. */
  resolveSlugPreAuth(host: string | undefined): string | null;
}

export class SessionTenantResolver implements TenantResolver {
  resolveSlugPreAuth(): null {
    return null;
  }
}

export class SubdomainTenantResolver implements TenantResolver {
  constructor(
    private readonly baseDomain: string,
    private readonly reserved: ReadonlySet<string> = RESERVED_SLUGS,
  ) {}

  resolveSlugPreAuth(host: string | undefined): string | null {
    if (!host) return null;
    const hostname = host.split(":")[0]?.toLowerCase() ?? "";
    const suffix = `.${this.baseDomain.toLowerCase()}`;
    if (!hostname.endsWith(suffix)) return null;
    const slug = hostname.slice(0, -suffix.length);
    if (!SLUG_RE.test(slug) || this.reserved.has(slug)) return null;
    return slug;
  }
}

/** Slug válido como etiqueta DNS: minúsculas, dígitos y guiones, 3-40 caracteres. */
export const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/;

/** Slugs no asignables a tenants (MODULES_SPEC §2.1). */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
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
]);

export function createTenantResolver(
  mode: "session" | "subdomain",
  baseDomain?: string,
): TenantResolver {
  if (mode === "subdomain") {
    if (!baseDomain) throw new Error("NEXO_BASE_DOMAIN es obligatoria en modo subdomain");
    return new SubdomainTenantResolver(baseDomain);
  }
  return new SessionTenantResolver();
}
