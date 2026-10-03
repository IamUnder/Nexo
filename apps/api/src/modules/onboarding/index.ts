/**
 * Módulo `onboarding`: checklist de activación (MODULES_SPEC §8). NO importa otros módulos ni lee sus
 * tablas: sus hitos se alcanzan al consumir eventos de `@nexo/contracts`.
 */
import {
  type DealEventV1,
  dealEventV1,
  dealStageChangedV1,
  EVENT_TYPES,
  type ImportBatchEventV1,
  importBatchEventV1,
  type MembershipChangedV1,
  membershipChangedV1,
  type ProjectEventV1,
  projectEventV1,
} from "@nexo/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "../../platform/db/database";
import type { EventSubscriber } from "../../platform/events/subscribers";
import { type createGuards, tenantContextOf } from "../../platform/http/guards";
import type { Clock } from "../../platform/ports";
import { OnboardingService } from "./application/onboardingService";
import { DbOnboardingRepository } from "./infrastructure/onboardingRepository";

const SUB = {
  dealCreated: "onboarding.deal_created",
  dealMoved: "onboarding.deal_moved",
  importCompleted: "onboarding.import_completed",
  memberCreated: "onboarding.member_created",
  projectCreated: "onboarding.project_created",
} as const;

/** Nombres de los suscriptores (dan nombre a sus colas); fuente única para la composición y `migrate`. */
export const ONBOARDING_SUBSCRIBER_NAMES = Object.values(SUB);

export interface OnboardingModule {
  service: OnboardingService;
  subscribers: EventSubscriber<never>[];
  registerRoutes(app: FastifyInstance): void;
}

export function createOnboardingModule(deps: {
  database: Database;
  guard: ReturnType<typeof createGuards>;
  clock: Clock;
}): OnboardingModule {
  const service = new OnboardingService({
    database: deps.database,
    repo: new DbOnboardingRepository(),
    clock: deps.clock,
  });

  const subscribers = [
    {
      name: SUB.dealCreated,
      eventType: EVENT_TYPES.dealCreated.type,
      version: EVENT_TYPES.dealCreated.version,
      payloadSchema: dealEventV1,
      async handle({ tx, ctx, event }) {
        await service.reach(tx, ctx.tenantId, "deal_created_or_moved", new Date(event.occurredAt));
      },
    } satisfies EventSubscriber<DealEventV1>,
    {
      name: SUB.dealMoved,
      eventType: EVENT_TYPES.dealStageChanged.type,
      version: EVENT_TYPES.dealStageChanged.version,
      payloadSchema: dealStageChangedV1,
      async handle({ tx, ctx, event }) {
        await service.reach(tx, ctx.tenantId, "deal_created_or_moved", new Date(event.occurredAt));
      },
    } satisfies EventSubscriber<ReturnType<typeof dealStageChangedV1.parse>>,
    {
      name: SUB.importCompleted,
      eventType: EVENT_TYPES.importBatchCompleted.type,
      version: EVENT_TYPES.importBatchCompleted.version,
      payloadSchema: importBatchEventV1,
      async handle({ tx, ctx, event }) {
        await service.addImported(
          tx,
          ctx.tenantId,
          event.payload.created + event.payload.updated,
          new Date(event.occurredAt),
        );
      },
    } satisfies EventSubscriber<ImportBatchEventV1>,
    {
      name: SUB.memberCreated,
      eventType: EVENT_TYPES.membershipCreated.type,
      version: EVENT_TYPES.membershipCreated.version,
      payloadSchema: membershipChangedV1,
      async handle({ tx, ctx, event }) {
        await service.addInvited(tx, ctx.tenantId, new Date(event.occurredAt));
      },
    } satisfies EventSubscriber<MembershipChangedV1>,
    {
      name: SUB.projectCreated,
      eventType: EVENT_TYPES.projectCreated.type,
      version: EVENT_TYPES.projectCreated.version,
      payloadSchema: projectEventV1,
      async handle({ tx, ctx, event }) {
        // Solo cuenta el proyecto que nace de un deal ganado.
        if (event.payload.sourceDealId) {
          await service.reach(tx, ctx.tenantId, "project_from_deal", new Date(event.occurredAt));
        }
      },
    } satisfies EventSubscriber<ProjectEventV1>,
  ];

  return {
    service,
    subscribers: subscribers as unknown as EventSubscriber<never>[],
    registerRoutes(app) {
      const r = app;
      r.get(
        "/api/v1/onboarding",
        { preHandler: deps.guard({ permission: "onboarding:checklist:read" }) },
        (req) => service.get(tenantContextOf(req)),
      );
      r.post(
        "/api/v1/onboarding/dismiss",
        { preHandler: deps.guard({ permission: "onboarding:checklist:manage" }) },
        async (req, reply) => {
          await service.setDismissed(tenantContextOf(req), true);
          return reply.status(204).send();
        },
      );
      r.post(
        "/api/v1/onboarding/restore",
        { preHandler: deps.guard({ permission: "onboarding:checklist:manage" }) },
        async (req, reply) => {
          await service.setDismissed(tenantContextOf(req), false);
          return reply.status(204).send();
        },
      );
    },
  };
}
