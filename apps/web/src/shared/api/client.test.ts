import type { SessionResponse } from "@nexo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "../../app/i18n";
import { useAuthStore } from "../auth/authStore";
import { ApiError, api, logout } from "./client";
import { errorMessage } from "./errors";

const session = (token: string): SessionResponse => ({
  kind: "session",
  accessToken: token,
  expiresIn: 900,
  user: { id: "u", email: "a@b.com", fullName: "Ana Gil", locale: "es", emailVerified: true },
  tenant: { id: "t", name: "Acme", slug: "acme", status: "active" },
  membership: { id: "m", role: "owner", seatType: "full" },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  useAuthStore.setState({ tenant: { status: "authenticated", session: session("viejo") } });
});
afterEach(() => vi.unstubAllGlobals());

const authHeader = (call: unknown[]) =>
  (call[1] as RequestInit | undefined)?.headers as Record<string, string> | undefined;

describe("api()", () => {
  it("envía el token de acceso y devuelve el JSON", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { ok: true }));
    expect(await api<{ ok: boolean }>("/team/members")).toEqual({ ok: true });
    expect(authHeader(fetchMock.mock.calls[0] ?? [])?.authorization).toBe("Bearer viejo");
  });

  it("no envía token en rutas públicas (scope none)", async () => {
    fetchMock.mockResolvedValueOnce(json(200, {}));
    await api("/auth/login", { method: "POST", body: { a: 1 }, scope: "none" });
    expect(authHeader(fetchMock.mock.calls[0] ?? [])?.authorization).toBeUndefined();
  });

  it("convierte los errores de la API en ApiError con su código estable", async () => {
    fetchMock.mockResolvedValueOnce(
      json(403, { error: { code: "limit.exceeded", params: { max: 5 } } }),
    );
    await expect(api("/x")).rejects.toMatchObject({
      status: 403,
      code: "limit.exceeded",
      params: { max: 5 },
    });
  });

  it("tolera respuestas de error sin JSON", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>502</html>", { status: 502 }));
    await expect(api("/x")).rejects.toMatchObject({ status: 502, code: "http.502" });
  });

  it("si el token caducó renueva la sesión UNA vez y reintenta la petición", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "auth.token_expired" } })) // petición original
      .mockResolvedValueOnce(json(200, session("nuevo"))) // refresh
      .mockResolvedValueOnce(json(200, { ok: 1 })); // reintento
    expect(await api("/team/members")).toEqual({ ok: 1 });
    expect(fetchMock.mock.calls[1]?.[0]).toBe("/api/v1/auth/refresh");
    expect(authHeader(fetchMock.mock.calls[1] ?? [])?.["x-nexo-csrf"]).toBe("1");
    expect(authHeader(fetchMock.mock.calls[2] ?? [])?.authorization).toBe("Bearer nuevo");
    expect(useAuthStore.getState().tenant.session?.accessToken).toBe("nuevo");
  });

  it("varias peticiones con el token caducado comparten UN solo refresh (no rota el token dos veces)", async () => {
    let refreshes = 0;
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        refreshes++;
        await new Promise((r) => setTimeout(r, 20));
        return json(200, session("nuevo"));
      }
      const token = (init?.headers as Record<string, string> | undefined)?.authorization;
      return token === "Bearer nuevo"
        ? json(200, { ok: true })
        : json(401, { error: { code: "auth.token_expired" } });
    });
    const results = await Promise.all([api("/a"), api("/b"), api("/c")]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshes).toBe(1);
  });

  it("si el refresh falla limpia la sesión y propaga el error original", async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, { error: { code: "auth.token_expired" } }))
      .mockResolvedValueOnce(json(401, { error: { code: "auth.unauthenticated" } }));
    await expect(api("/team/members")).rejects.toMatchObject({ code: "auth.token_expired" });
    expect(useAuthStore.getState().tenant.status).toBe("anonymous");
    expect(useAuthStore.getState().tenant.session).toBeNull();
  });

  it("un 401 que no es de caducidad no intenta refrescar", async () => {
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: "auth.unauthenticated" } }));
    await expect(api("/x")).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("logout limpia la sesión aunque la petición falle", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("sin red"));
    await expect(logout("tenant")).rejects.toThrow();
    expect(useAuthStore.getState().tenant.status).toBe("anonymous");
  });
});

describe("errorMessage()", () => {
  const t = createI18n("es").t;

  it("traduce los códigos conocidos con sus parámetros", () => {
    expect(errorMessage(t, new ApiError(401, "auth.invalid_credentials"))).toBe(
      "El email o la contraseña no son correctos.",
    );
    expect(
      errorMessage(t, new ApiError(403, "limit.exceeded", { limit: "seats:full", max: 5 })),
    ).toContain("seats:full: 5");
  });

  it("nunca muestra el código crudo ni texto técnico", () => {
    const m = errorMessage(t, new ApiError(500, "algo.raro"));
    expect(m).not.toContain("algo.raro");
    expect(m).toContain("Algo ha fallado");
    expect(errorMessage(t, new ApiError(418, "otro.codigo"))).toBe(
      "No se ha podido completar la acción. Inténtalo de nuevo.",
    );
    expect(errorMessage(t, new Error("detalle interno"))).not.toContain("detalle interno");
  });

  it("distingue los errores de red", () => {
    expect(errorMessage(t, new TypeError("Failed to fetch"))).toContain("conexión");
  });

  it("existe traducción en español e inglés para los códigos de la API", async () => {
    const { ERROR_CODES } = await import("@nexo/contracts");
    const en = createI18n("en").t;
    for (const code of ERROR_CODES) {
      expect(t(`errors:${code}`, { defaultValue: "" }), `es ${code}`).not.toBe("");
      expect(en(`errors:${code}`, { defaultValue: "" }), `en ${code}`).not.toBe("");
    }
  });
});
