import type { EventEnvelope } from "@nexo/contracts";
import type { ZodType } from "zod";
import type { Tx } from "../db/database";
import type { TenantContext } from "../tenant/context";

/**
 * Suscriptor de un evento de dominio (ARCHITECTURE §9). Lo registra su módulo y lo cablea `composition/`.
 * El handler corre dentro de `withTenant(event.tenantId)` y debe ser IDEMPOTENTE: la entrega es
 * «al menos una vez» (la tabla `processed_events` evita repeticiones normales, pero un fallo entre
 * el efecto y el registro puede repetir el handler).
 */
export interface EventSubscriber<TPayload = unknown> {
  /** Nombre único `<módulo>.<descripción>`; da nombre a la cola `evt.<name>`. */
  name: string;
  eventType: string;
  version: number;
  payloadSchema: ZodType<TPayload>;
  handle(args: { tx: Tx; ctx: TenantContext; event: EventEnvelope<TPayload> }): Promise<void>;
}

export class SubscriberRegistry {
  private readonly subscribers = new Map<string, EventSubscriber>();

  register<T>(subscriber: EventSubscriber<T>): this {
    if (!/^[a-z][a-z0-9_.-]*$/.test(subscriber.name)) {
      throw new Error(`Nombre de suscriptor no válido: ${subscriber.name}`);
    }
    if (this.subscribers.has(subscriber.name)) {
      throw new Error(`Suscriptor duplicado: ${subscriber.name}`);
    }
    this.subscribers.set(subscriber.name, subscriber as EventSubscriber);
    return this;
  }

  all(): EventSubscriber[] {
    return [...this.subscribers.values()];
  }

  get(name: string): EventSubscriber | undefined {
    return this.subscribers.get(name);
  }

  forEvent(type: string, version: number): EventSubscriber[] {
    return this.all().filter((s) => s.eventType === type && s.version === version);
  }

  /** Cola de pg-boss de un suscriptor. */
  static queueFor(name: string): string {
    return `evt.${name}`;
  }
}
