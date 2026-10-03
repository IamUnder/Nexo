/**
 * Módulo `crm` (negocio, Core): empresas, contactos, oportunidades, pipelines, actividad y tareas.
 * Superficie pública para `composition/`. NO importa otros módulos: los nombres de miembros llegan por
 * el puerto `MemberDirectory` y reacciona a la creación de tenants por el evento `tenancy.tenant.created`.
 */
import { EVENT_TYPES, type TenantCreatedV1, tenantCreatedV1 } from "@nexo/contracts";
import type { FastifyInstance } from "fastify";
import type { Database } from "../../platform/db/database";
import type { EventSubscriber } from "../../platform/events/subscribers";
import type { createGuards } from "../../platform/http/guards";
import type { AuditLogger, Clock } from "../../platform/ports";
import { AccountService } from "./application/accountService";
import { ActivityService } from "./application/activityService";
import { ContactService } from "./application/contactService";
import { DealService } from "./application/dealService";
import { PipelineService } from "./application/pipelineService";
import type { MemberDirectory } from "./application/ports";
import { registerCrmRoutes } from "./http/routes";
import { DbCrmRepository } from "./infrastructure/crmRepository";

export type { MemberDirectory } from "./application/ports";

/** Nombre del suscriptor (da nombre a su cola); fuente única para la composición y `migrate`. */
export const CRM_DEFAULT_PIPELINE = "crm.default_pipeline";
export const CRM_SUBSCRIBER_NAMES = [CRM_DEFAULT_PIPELINE] as const;

export interface CrmModule {
  subscribers: EventSubscriber<TenantCreatedV1>[];
  registerRoutes(app: FastifyInstance): void;
  /** Para pruebas: acceso directo a los servicios. */
  services: {
    accounts: AccountService;
    contacts: ContactService;
    pipelines: PipelineService;
    deals: DealService;
    activities: ActivityService;
  };
}

export function createCrmModule(deps: {
  database: Database;
  guard: ReturnType<typeof createGuards>;
  members: MemberDirectory;
  audit: AuditLogger;
  clock: Clock;
}): CrmModule {
  const d = {
    database: deps.database,
    repo: new DbCrmRepository(),
    members: deps.members,
    audit: deps.audit,
    clock: deps.clock,
  };
  const pipelines = new PipelineService(d);
  const services = {
    accounts: new AccountService(d),
    contacts: new ContactService(d),
    pipelines,
    deals: new DealService(d, pipelines),
    activities: new ActivityService(d),
  };

  return {
    services,
    subscribers: [
      {
        // Todo tenant nuevo nace con su pipeline de ventas listo (el CRM funciona sin configurar nada).
        name: CRM_DEFAULT_PIPELINE,
        eventType: EVENT_TYPES.tenantCreated.type,
        version: EVENT_TYPES.tenantCreated.version,
        payloadSchema: tenantCreatedV1,
        async handle({ tx, ctx }) {
          await pipelines.ensureDefault(tx, ctx.tenantId);
        },
      },
    ],
    registerRoutes: (app) => registerCrmRoutes(app, { services, guard: deps.guard }),
  };
}
