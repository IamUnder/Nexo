import { CRM_SUBSCRIBER_NAMES } from "../modules/crm";
import { DELIVERY_SUBSCRIBER_NAMES } from "../modules/delivery";
import { IDENTITY_SUBSCRIBER_NAMES } from "../modules/identity";
import { INSIGHTS_SUBSCRIBER_NAMES } from "../modules/insights";
import { ONBOARDING_SUBSCRIBER_NAMES } from "../modules/onboarding";
import { SubscriberRegistry } from "../platform/events/subscribers";

/**
 * Colas de pg-boss que debe crear `migrate` (requiere DDL). Una por suscriptor de eventos.
 * Se deriva de los nombres ESTÁTICOS de cada módulo para no tener que construir servicios (ni conectar
 * a la base de datos) al migrar. Un test comprueba que coincide con el registro real de suscriptores.
 */
export const SUBSCRIBER_NAMES: readonly string[] = [
  ...IDENTITY_SUBSCRIBER_NAMES,
  ...CRM_SUBSCRIBER_NAMES,
  ...INSIGHTS_SUBSCRIBER_NAMES,
  ...DELIVERY_SUBSCRIBER_NAMES,
  ...ONBOARDING_SUBSCRIBER_NAMES,
];

export const SUBSCRIBER_QUEUES: string[] = SUBSCRIBER_NAMES.map((n) =>
  SubscriberRegistry.queueFor(n),
);
