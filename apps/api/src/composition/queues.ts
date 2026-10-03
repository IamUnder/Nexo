import { CRM_SUBSCRIBER_NAMES } from "../modules/crm";
import { IDENTITY_SUBSCRIBER_NAMES } from "../modules/identity";
import { SubscriberRegistry } from "../platform/events/subscribers";

/**
 * Colas de pg-boss que debe crear `migrate` (requiere DDL). Una por suscriptor de eventos.
 * Se deriva de los nombres ESTÁTICOS de cada módulo para no tener que construir servicios (ni conectar
 * a la base de datos) al migrar. Un test comprueba que coincide con el registro real de suscriptores.
 */
export const SUBSCRIBER_NAMES: readonly string[] = [
  ...IDENTITY_SUBSCRIBER_NAMES,
  ...CRM_SUBSCRIBER_NAMES,
];

export const SUBSCRIBER_QUEUES: string[] = SUBSCRIBER_NAMES.map((n) =>
  SubscriberRegistry.queueFor(n),
);
