import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import enAdmin from "../locales/en/admin.json";
import enAudit from "../locales/en/audit.json";
import enAuth from "../locales/en/auth.json";
import enCommon from "../locales/en/common.json";
import enCrm from "../locales/en/crm.json";
import enDelivery from "../locales/en/delivery.json";
import enErrors from "../locales/en/errors.json";
import enHome from "../locales/en/home.json";
import enImport from "../locales/en/import.json";
import enInsights from "../locales/en/insights.json";
import enSettings from "../locales/en/settings.json";
import enTeam from "../locales/en/team.json";
import esAdmin from "../locales/es/admin.json";
import esAudit from "../locales/es/audit.json";
import esAuth from "../locales/es/auth.json";
import esCommon from "../locales/es/common.json";
import esCrm from "../locales/es/crm.json";
import esDelivery from "../locales/es/delivery.json";
import esErrors from "../locales/es/errors.json";
import esHome from "../locales/es/home.json";
import esImport from "../locales/es/import.json";
import esInsights from "../locales/es/insights.json";
import esSettings from "../locales/es/settings.json";
import esTeam from "../locales/es/team.json";

/**
 * i18n: español por defecto (D-01), inglés preparado. Un namespace por feature
 * (`common`, `auth`, `team`…). Los textos NUNCA van en el código (AGENTS.md §2.5).
 * `pnpm check:i18n` falla si faltan claves en algún idioma.
 */
export const defaultNS = "common";
export const NAMESPACES = [
  "common",
  "errors",
  "auth",
  "home",
  "team",
  "settings",
  "admin",
  "audit",
  "crm",
  "insights",
  "import",
  "delivery",
] as const;

export const resources = {
  es: {
    common: esCommon,
    errors: esErrors,
    auth: esAuth,
    home: esHome,
    team: esTeam,
    settings: esSettings,
    admin: esAdmin,
    audit: esAudit,
    crm: esCrm,
    insights: esInsights,
    import: esImport,
    delivery: esDelivery,
  },
  en: {
    common: enCommon,
    errors: enErrors,
    auth: enAuth,
    home: enHome,
    team: enTeam,
    settings: enSettings,
    admin: enAdmin,
    audit: enAudit,
    crm: enCrm,
    insights: enInsights,
    import: enImport,
    delivery: enDelivery,
  },
} as const;

export function createI18n(lng = "es") {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    lng,
    fallbackLng: "es",
    defaultNS,
    ns: [...NAMESPACES],
    resources,
    interpolation: { escapeValue: false }, // React ya escapa
    returnNull: false,
  });
  return instance;
}

export const i18n = createI18n();
