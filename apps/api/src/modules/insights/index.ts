/**
 * Módulo `insights` (negocio, Core): panel de ventas a partir de read models alimentados por eventos.
 * NO importa otros módulos ni lee sus tablas: solo consume eventos de `@nexo/contracts`.
 */
import {
  type ActivityLoggedV1,
  activityLoggedV1,
  type DealEventV1,
  type DealLostV1,
  type DealStageChangedV1,
  type DealWonV1,
  dealEventV1,
  dealLostV1,
  dealStageChangedV1,
  dealWonV1,
  EVENT_TYPES,
} from "@nexo/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "../../platform/db/database";
import type { EventSubscriber } from "../../platform/events/subscribers";
import type { createGuards } from "../../platform/http/guards";
import type { Clock } from "../../platform/ports";
import { InsightsService } from "./application/insightsService";
import { registerInsightsRoutes } from "./http/routes";
import { DbInsightsRepository } from "./infrastructure/insightsRepository";

const SUB = {
  dealCreated: "insights.deal_created",
  dealUpdated: "insights.deal_updated",
  dealStageChanged: "insights.deal_stage_changed",
  dealWon: "insights.deal_won",
  dealLost: "insights.deal_lost",
  dealDeleted: "insights.deal_deleted",
  activityLogged: "insights.activity_logged",
} as const;

/** Nombres de los suscriptores (dan nombre a sus colas); fuente única para la composición y `migrate`. */
export const INSIGHTS_SUBSCRIBER_NAMES = Object.values(SUB);

export interface InsightsModule {
  subscribers: EventSubscriber<never>[];
  registerRoutes(app: FastifyInstance): void;
  service: InsightsService;
}

export function createInsightsModule(deps: {
  database: Database;
  guard: ReturnType<typeof createGuards>;
  clock: Clock;
}): InsightsModule {
  const repo = new DbInsightsRepository();
  const service = new InsightsService({ database: deps.database, repo, clock: deps.clock });

  const dealUpsert = <T extends DealEventV1>(
    name: string,
    event: { type: string; version: number },
    schema: EventSubscriber<T>["payloadSchema"],
    extra?: (p: T) => { lostReason?: string | null },
  ): EventSubscriber<T> => ({
    name,
    eventType: event.type,
    version: event.version,
    payloadSchema: schema,
    async handle({ tx, ctx, event: e }) {
      await repo.upsertDeal(
        tx,
        ctx.tenantId,
        { ...e.payload, ...(extra?.(e.payload) ?? {}) },
        new Date(e.occurredAt),
      );
    },
  });

  const subscribers = [
    dealUpsert(SUB.dealCreated, EVENT_TYPES.dealCreated, dealEventV1),
    dealUpsert(SUB.dealUpdated, EVENT_TYPES.dealUpdated, dealEventV1),
    dealUpsert<DealWonV1>(SUB.dealWon, EVENT_TYPES.dealWon, dealWonV1),
    dealUpsert<DealLostV1>(SUB.dealLost, EVENT_TYPES.dealLost, dealLostV1, (p) => ({
      lostReason: p.lostReason,
    })),
    {
      ...dealUpsert<DealStageChangedV1>(
        SUB.dealStageChanged,
        EVENT_TYPES.dealStageChanged,
        dealStageChangedV1,
      ),
      async handle({ tx, ctx, event: e }) {
        const at = new Date(e.occurredAt);
        await repo.upsertDeal(tx, ctx.tenantId, e.payload, at);
        await repo.addStageChange(tx, {
          tenantId: ctx.tenantId,
          eventId: e.id,
          dealId: e.payload.dealId,
          fromStageName: e.payload.fromStageName,
          toStageName: e.payload.toStageName,
          occurredAt: at,
        });
      },
    } satisfies EventSubscriber<DealStageChangedV1>,
    {
      name: SUB.dealDeleted,
      eventType: EVENT_TYPES.dealDeleted.type,
      version: EVENT_TYPES.dealDeleted.version,
      payloadSchema: dealEventV1,
      async handle({ tx, ctx, event: e }) {
        await repo.deleteDeal(tx, ctx.tenantId, e.payload.dealId);
      },
    } satisfies EventSubscriber<DealEventV1>,
    {
      name: SUB.activityLogged,
      eventType: EVENT_TYPES.activityLogged.type,
      version: EVENT_TYPES.activityLogged.version,
      payloadSchema: activityLoggedV1,
      async handle({ tx, ctx, event: e }) {
        const p: ActivityLoggedV1 = e.payload;
        await repo.bumpActivity(
          tx,
          ctx.tenantId,
          e.occurredAt.slice(0, 10),
          p.kind,
          e.actor.membershipId,
        );
      },
    } satisfies EventSubscriber<ActivityLoggedV1>,
  ];

  return {
    service,
    subscribers: subscribers as unknown as EventSubscriber<never>[],
    registerRoutes: (app) => registerInsightsRoutes(app, { service, guard: deps.guard }),
  };
}
