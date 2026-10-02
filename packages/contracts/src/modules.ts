import { z } from "zod";

/**
 * Claves de módulo contratable (MODULES_SPEC §1.5).
 * Las claves de entitlement se derivan: `module:<key>`, `seats:<tipo>`, `limit:<métrica>`.
 */
export const CORE_MODULE_KEYS = [
  "crm",
  "communication",
  "delivery",
  "data_import",
  "insights",
] as const;

/** Add-ons futuros: reservados aquí para que el catálogo y los entitlements ya los conozcan. */
export const ADDON_MODULE_KEYS = [
  "sales_pro",
  "projects_pro",
  "support",
  "billing_payments",
  "marketing",
  "whatsapp",
  "field_service",
  "portal",
  "automation_bi",
  "governance",
  "ai_copilot",
] as const;

export const MODULE_KEYS = [...CORE_MODULE_KEYS, ...ADDON_MODULE_KEYS] as const;

export const moduleKeySchema = z.enum(MODULE_KEYS);
export type ModuleKey = z.infer<typeof moduleKeySchema>;

export const entitlementKey = {
  module: (key: ModuleKey) => `module:${key}` as const,
  seats: (type: "full" | "light") => `seats:${type}` as const,
  limit: (metric: string) => `limit:${metric}` as const,
};
