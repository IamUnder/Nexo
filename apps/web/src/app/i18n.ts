import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import enCommon from "../locales/en/common.json";
import esCommon from "../locales/es/common.json";

/**
 * i18n: español por defecto (D-01), inglés preparado. Un namespace por feature
 * (`common`, `crm`, `delivery`…). Los textos NUNCA van en el código (AGENTS.md §2.5).
 * `pnpm check:i18n` falla si faltan claves en algún idioma.
 */
export const defaultNS = "common";
export const resources = {
  es: { common: esCommon },
  en: { common: enCommon },
} as const;

export function createI18n(lng = "es") {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    lng,
    fallbackLng: "es",
    defaultNS,
    ns: [defaultNS],
    resources,
    interpolation: { escapeValue: false }, // React ya escapa
    returnNull: false,
  });
  return instance;
}

export const i18n = createI18n();
