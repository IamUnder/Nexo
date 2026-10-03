import type { AdminSessionResponse, ApiErrorBody, SessionResponse } from "@nexo/contracts";
import { adminToken, tenantToken, useAuthStore } from "../auth/authStore";

/** Error de la API con el código estable que la UI traduce (`errors:<code>`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly params?: Record<string, string | number | boolean>,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

export type Scope = "tenant" | "admin" | "none";

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  scope?: Scope;
  signal?: AbortSignal | undefined;
}

const BASE = "/api/v1";
/** Cabecera anti-CSRF que exigen los endpoints con cookie (la API la comprueba). */
const CSRF = { "x-nexo-csrf": "1" };

async function parseError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await res.json()) as Partial<ApiErrorBody>;
  } catch {
    /* sin cuerpo JSON */
  }
  return new ApiError(res.status, body.error?.code ?? `http.${res.status}`, body.error?.params);
}

async function raw<T>(path: string, opts: RequestOptions, token: string | undefined): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    credentials: "include",
    ...(opts.signal ? { signal: opts.signal } : {}),
    headers: {
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204 || res.status === 202) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

// ── Refresh de sesión de UN SOLO VUELO: varias peticiones con token caducado comparten una renovación ──
const inflight: Partial<Record<"tenant" | "admin", Promise<boolean>>> = {};

async function doRefresh(scope: "tenant" | "admin"): Promise<boolean> {
  try {
    if (scope === "tenant") {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: CSRF,
      });
      if (!res.ok) throw await parseError(res);
      useAuthStore.getState().setTenant((await res.json()) as SessionResponse);
    } else {
      const res = await fetch(`${BASE}/admin/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: CSRF,
      });
      if (!res.ok) throw await parseError(res);
      useAuthStore.getState().setAdmin((await res.json()) as AdminSessionResponse);
    }
    return true;
  } catch {
    if (scope === "tenant") useAuthStore.getState().clearTenant();
    else useAuthStore.getState().clearAdmin();
    return false;
  }
}

export function refreshSession(scope: "tenant" | "admin"): Promise<boolean> {
  inflight[scope] ??= doRefresh(scope).finally(() => {
    delete inflight[scope];
  });
  return inflight[scope] as Promise<boolean>;
}

/** Restaura la sesión al cargar la app usando la cookie de refresh (si existe y es válida). */
export async function bootstrapSession(scope: "tenant" | "admin"): Promise<void> {
  await refreshSession(scope);
}

/**
 * Petición a la API. Si el access token caducó (401 `auth.token_expired`) renueva la sesión UNA vez y
 * reintenta; si no se puede renovar, la sesión se limpia y el router redirige al login.
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const scope = opts.scope ?? "tenant";
  const token = scope === "tenant" ? tenantToken() : scope === "admin" ? adminToken() : undefined;
  try {
    return await raw<T>(path, opts, token);
  } catch (err) {
    if (
      err instanceof ApiError &&
      err.status === 401 &&
      scope !== "none" &&
      err.code === "auth.token_expired"
    ) {
      if (await refreshSession(scope)) {
        return raw<T>(path, opts, scope === "tenant" ? tenantToken() : adminToken());
      }
    }
    throw err;
  }
}

/** Descarga un fichero protegido (CSV de exportación) con el token de sesión y lo guarda en el navegador. */
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = tenantToken();
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw await parseError(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function logout(scope: "tenant" | "admin"): Promise<void> {
  const path = scope === "tenant" ? "/auth/logout" : "/admin/auth/logout";
  try {
    await fetch(`${BASE}${path}`, { method: "POST", credentials: "include", headers: CSRF });
  } finally {
    if (scope === "tenant") useAuthStore.getState().clearTenant();
    else useAuthStore.getState().clearAdmin();
  }
}
