import type { EventEnvelope } from "@nexo/contracts";
import { and, eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { Database } from "../db/database";
import { withPlatform } from "../db/platform";
import { outboxEvents, processedEvents } from "../db/schema";
import type { Logger } from "../logger";
import { systemContext } from "../tenant/context";
import { type EventSubscriber, SubscriberRegistry } from "./subscribers";

/**
 * DISPATCHER del outbox (ARCHITECTURE §9.2). Lee eventos pendientes de TODOS los tenants (por eso usa
 * el pool de plataforma) y crea un job de pg-boss por suscriptor, de modo que el fallo de un consumidor
 * no bloquea a otros. No ejecuta handlers: eso lo hacen los workers de cada cola, ya dentro de
 * `withTenant(event.tenantId)`.
 */
export async function dispatchPending(
  database: Database,
  boss: Pick<PgBoss, "send">,
  registry: SubscriberRegistry,
  batchSize = 100,
): Promise<number> {
  return withPlatform(database, "dispatcher del outbox (transversal a tenants)", async (tx) => {
    const pending = await tx.execute<{
      id: string;
      tenant_id: string;
      type: string;
      version: number;
    }>(
      sql`select id, tenant_id, type, version
            from outbox_events
           where status = 'pending'
           order by occurred_at
           limit ${batchSize}
             for update skip locked`,
    );

    for (const row of pending.rows) {
      for (const subscriber of registry.forEvent(row.type, row.version)) {
        // Idempotente por (suscriptor, evento): si el dispatcher falla tras encolar y reintenta,
        // `singletonKey` evita duplicar el job mientras el anterior siga vivo.
        await boss.send(
          SubscriberRegistry.queueFor(subscriber.name),
          { tenantId: row.tenant_id, eventId: row.id },
          { singletonKey: row.id },
        );
      }
      await tx
        .update(outboxEvents)
        .set({ status: "dispatched", dispatchedAt: new Date(), updatedAt: new Date() })
        .where(eq(outboxEvents.id, row.id));
    }
    return pending.rows.length;
  });
}

export interface EventJobData {
  tenantId: string;
  eventId: string;
}

/**
 * Ejecuta UN suscriptor para UN evento dentro de `withTenant`. El efecto del handler y la marca de
 * «procesado» van en la misma transacción: para efectos solo en BD, la entrega es exactly-once.
 */
export async function runSubscriber(
  database: Database,
  subscriber: EventSubscriber,
  data: EventJobData,
  logger: Logger,
): Promise<"processed" | "skipped"> {
  return database.withTenant({ tenantId: data.tenantId }, async (tx) => {
    const [row] = await tx.select().from(outboxEvents).where(eq(outboxEvents.id, data.eventId));
    if (!row) {
      // Con RLS, un evento de otro tenant tampoco es visible: nunca se procesa cruzado.
      logger.warn(
        { eventId: data.eventId, subscriber: subscriber.name },
        "evento no encontrado; se descarta",
      );
      return "skipped";
    }

    const [done] = await tx
      .select({ eventId: processedEvents.eventId })
      .from(processedEvents)
      .where(
        and(
          eq(processedEvents.tenantId, data.tenantId),
          eq(processedEvents.subscriber, subscriber.name),
          eq(processedEvents.eventId, data.eventId),
        ),
      );
    if (done) return "skipped";

    const payload = subscriber.payloadSchema.parse(row.payload);
    const event: EventEnvelope<unknown> = {
      id: row.id,
      type: row.type,
      version: row.version,
      tenantId: row.tenantId,
      occurredAt: row.occurredAt.toISOString(),
      actor: row.actor as EventEnvelope["actor"],
      entity: { type: row.entityType, id: row.entityId },
      payload,
    };

    await subscriber.handle({ tx, ctx: systemContext(data.tenantId), event });
    await tx
      .insert(processedEvents)
      .values({ tenantId: data.tenantId, subscriber: subscriber.name, eventId: data.eventId });
    return "processed";
  });
}

/** Bucle de despacho: cada `intervalMs` vacía el outbox. Devuelve la función de parada. */
export function startDispatcher(args: {
  database: Database;
  boss: Pick<PgBoss, "send">;
  registry: SubscriberRegistry;
  logger: Logger;
  intervalMs?: number;
}): () => Promise<void> {
  const { database, boss, registry, logger } = args;
  let running = false;
  let stopped = false;

  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try {
      let n: number;
      do {
        n = await dispatchPending(database, boss, registry);
      } while (n > 0 && !stopped);
    } catch (err) {
      logger.error({ err }, "fallo en el dispatcher del outbox");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), args.intervalMs ?? 1000);
  void tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    while (running) await new Promise((r) => setTimeout(r, 25));
  };
}

/** Registra un worker de pg-boss por suscriptor. */
export async function startSubscribers(args: {
  database: Database;
  boss: Pick<PgBoss, "work">;
  registry: SubscriberRegistry;
  logger: Logger;
}): Promise<void> {
  const { database, boss, registry, logger } = args;
  for (const subscriber of registry.all()) {
    await boss.work<EventJobData>(
      SubscriberRegistry.queueFor(subscriber.name),
      { batchSize: 1 },
      async (jobs) => {
        for (const job of jobs) {
          // Si lanza, pg-boss reintenta con backoff y, agotados los reintentos, pasa a `evt.dead`.
          await runSubscriber(database, subscriber, job.data, logger);
        }
      },
    );
  }
}
