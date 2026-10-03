import type { TFunction } from "i18next";
import { ApiError } from "./client";

/**
 * Traduce cualquier error a un texto de usuario. Los códigos de la API son estables y viven en el
 * namespace `errors`; si no hay traducción específica se muestra el mensaje genérico (nunca un
 * texto técnico, una traza ni el `code` crudo).
 */
export function errorMessage(t: TFunction, err: unknown): string {
  if (err instanceof ApiError) {
    const key = `errors:${err.code}`;
    // `limit.exceeded` y similares interpolan sus parámetros.
    const translated = t(key, { ...err.params, defaultValue: "" });
    if (translated) return translated;
    if (err.status >= 500) return t("errors:internal.error");
    if (err.status === 0 || err.code.startsWith("network")) return t("errors:network");
  }
  if (err instanceof TypeError) return t("errors:network"); // fetch sin conexión
  return t("errors:generic");
}
