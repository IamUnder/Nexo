/**
 * Módulo `delivery` (Core): proyectos, hitos, tareas y tiempo. NO importa `crm`: recibe el deal ganado y los
 * cambios de empresa por eventos (`@nexo/contracts`) y guarda una referencia + snapshot de la cuenta.
 */
import {
  type AccountEventV1,
  accountEventV1,
  type DealWonV1,
  dealWonV1,
  EVENT_TYPES,
} from "@nexo/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "../../platform/db/database";
import type { EventSubscriber } from "../../platform/events/subscribers";
import type { createGuards } from "../../platform/http/guards";
import type { AuditLogger, Clock } from "../../platform/ports";
import { DeliveryService } from "./application/deliveryService";
import type { MemberDirectory } from "./application/ports";
import { registerDeliveryRoutes } from "./http/routes";
import { DbDeliveryRepository } from "./infrastructure/deliveryRepository";

export type { MemberDirectory } from "./application/ports";

const SUB = {
  fromDeal: "delivery.project_from_deal",
  accountUpdated: "delivery.account_synced",
  accountDeleted: "delivery.account_archived",
} as const;

/** Nombres de los suscriptores (dan nombre a sus colas); fuente única para la composición y `migrate`. */
export const DELIVERY_SUBSCRIBER_NAMES = Object.values(SUB);

export interface DeliveryModule {
  service: DeliveryService;
  subscribers: EventSubscriber<never>[];
  registerRoutes(app: FastifyInstance): void;
}

export function createDeliveryModule(deps: {
  database: Database;
  guard: ReturnType<typeof createGuards>;
  members: MemberDirectory;
  audit: AuditLogger;
  clock: Clock;
}): DeliveryModule {
  const service = new DeliveryService({
    database: deps.database,
    repo: new DbDeliveryRepository(),
    members: deps.members,
    audit: deps.audit,
    clock: deps.clock,
  });

  const subscribers = [
    {
      name: SUB.fromDeal,
      eventType: EVENT_TYPES.dealWon.type,
      version: EVENT_TYPES.dealWon.version,
      payloadSchema: dealWonV1,
      async handle({ tx, ctx, event }) {
        await service.createFromDeal(tx, ctx, event.payload);
      },
    } satisfies EventSubscriber<DealWonV1>,
    {
      name: SUB.accountUpdated,
      eventType: EVENT_TYPES.accountUpdated.type,
      version: EVENT_TYPES.accountUpdated.version,
      payloadSchema: accountEventV1,
      async handle({ tx, event }) {
        await service.syncAccount(tx, event.payload.accountId, event.payload.name);
      },
    } satisfies EventSubscriber<AccountEventV1>,
    {
      name: SUB.accountDeleted,
      eventType: EVENT_TYPES.accountDeleted.type,
      version: EVENT_TYPES.accountDeleted.version,
      payloadSchema: accountEventV1,
      async handle({ tx, event }) {
        await service.syncAccount(tx, event.payload.accountId, null);
      },
    } satisfies EventSubscriber<AccountEventV1>,
  ];

  return {
    service,
    subscribers: subscribers as unknown as EventSubscriber<never>[],
    registerRoutes: (app) => registerDeliveryRoutes(app, { service, guard: deps.guard }),
  };
}
