import {
  activitiesQuerySchema,
  createAccountInputSchema,
  createActivityInputSchema,
  createContactInputSchema,
  createDealInputSchema,
  createPipelineInputSchema,
  createTaskInputSchema,
  dealsQuerySchema,
  idParamSchema,
  listQuerySchema,
  loseDealInputSchema,
  moveDealInputSchema,
  searchQuerySchema,
  setStagesInputSchema,
  tasksQuerySchema,
  updateAccountInputSchema,
  updateContactInputSchema,
  updateDealInputSchema,
  updateTaskInputSchema,
} from "@nexo/contracts";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { type createGuards, tenantContextOf } from "../../../platform/http/guards";
import type { AccountService } from "../application/accountService";
import type { ActivityService } from "../application/activityService";
import type { ContactService } from "../application/contactService";
import type { DealService } from "../application/dealService";
import type { PipelineService } from "../application/pipelineService";
import type { SampleDataService } from "../application/sampleDataService";
import type { Access } from "../application/shared";

export interface CrmServices {
  accounts: AccountService;
  contacts: ContactService;
  pipelines: PipelineService;
  deals: DealService;
  activities: ActivityService;
  sampleData: SampleDataService;
}

/** Alcance concedido por el permiso exigido por el guard (`own` | `all`). */
const accessOf = (req: FastifyRequest): Access => ({ scope: req.permissionScope ?? "all" });

export function registerCrmRoutes(
  app: FastifyInstance,
  deps: { services: CrmServices; guard: ReturnType<typeof createGuards> },
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { accounts, contacts, pipelines, deals, activities, sampleData } = deps.services;
  const guard = deps.guard;
  /** Todas las rutas del CRM exigen el módulo contratado + un permiso concreto. */
  const g = (
    permission: Parameters<typeof guard>[0] extends infer O
      ? O extends { permission?: infer P }
        ? P
        : never
      : never,
  ) => guard({ entitlement: "crm", permission });
  const P = "/api/v1/crm";

  // ── Empresas ──────────────────────────────────────────────────────────────────────────────────
  r.get(
    `${P}/accounts`,
    { schema: { querystring: listQuerySchema }, preHandler: g("crm:account:read") },
    (req) => accounts.list(tenantContextOf(req), accessOf(req), req.query),
  );
  r.post(
    `${P}/accounts`,
    { schema: { body: createAccountInputSchema }, preHandler: g("crm:account:create") },
    async (req, reply) =>
      reply.status(201).send(await accounts.create(tenantContextOf(req), accessOf(req), req.body)),
  );
  r.get(
    `${P}/accounts/:id`,
    { schema: { params: idParamSchema }, preHandler: g("crm:account:read") },
    (req) => accounts.get(tenantContextOf(req), accessOf(req), req.params.id),
  );
  r.patch(
    `${P}/accounts/:id`,
    {
      schema: { params: idParamSchema, body: updateAccountInputSchema },
      preHandler: g("crm:account:update"),
    },
    (req) => accounts.update(tenantContextOf(req), accessOf(req), req.params.id, req.body),
  );
  r.delete(
    `${P}/accounts/:id`,
    { schema: { params: idParamSchema }, preHandler: g("crm:account:delete") },
    async (req, reply) => {
      await accounts.delete(tenantContextOf(req), accessOf(req), req.params.id);
      return reply.status(204).send();
    },
  );

  // ── Contactos ─────────────────────────────────────────────────────────────────────────────────
  r.get(
    `${P}/contacts`,
    { schema: { querystring: listQuerySchema }, preHandler: g("crm:contact:read") },
    (req) => contacts.list(tenantContextOf(req), accessOf(req), req.query),
  );
  r.post(
    `${P}/contacts`,
    { schema: { body: createContactInputSchema }, preHandler: g("crm:contact:create") },
    async (req, reply) =>
      reply.status(201).send(await contacts.create(tenantContextOf(req), accessOf(req), req.body)),
  );
  r.get(
    `${P}/contacts/:id`,
    { schema: { params: idParamSchema }, preHandler: g("crm:contact:read") },
    (req) => contacts.get(tenantContextOf(req), accessOf(req), req.params.id),
  );
  r.patch(
    `${P}/contacts/:id`,
    {
      schema: { params: idParamSchema, body: updateContactInputSchema },
      preHandler: g("crm:contact:update"),
    },
    (req) => contacts.update(tenantContextOf(req), accessOf(req), req.params.id, req.body),
  );
  r.delete(
    `${P}/contacts/:id`,
    { schema: { params: idParamSchema }, preHandler: g("crm:contact:delete") },
    async (req, reply) => {
      await contacts.delete(tenantContextOf(req), accessOf(req), req.params.id);
      return reply.status(204).send();
    },
  );

  // ── Pipelines ─────────────────────────────────────────────────────────────────────────────────
  r.get(`${P}/pipelines`, { preHandler: g("crm:deal:read") }, (req) =>
    pipelines.list(tenantContextOf(req)),
  );
  r.post(
    `${P}/pipelines`,
    { schema: { body: createPipelineInputSchema }, preHandler: g("crm:pipeline:manage") },
    async (req, reply) =>
      reply.status(201).send(await pipelines.create(tenantContextOf(req), req.body.name)),
  );
  r.put(
    `${P}/pipelines/:id/stages`,
    {
      schema: { params: idParamSchema, body: setStagesInputSchema },
      preHandler: g("crm:pipeline:manage"),
    },
    (req) => pipelines.setStages(tenantContextOf(req), req.params.id, req.body),
  );

  // ── Oportunidades ─────────────────────────────────────────────────────────────────────────────
  r.get(
    `${P}/deals`,
    { schema: { querystring: dealsQuerySchema }, preHandler: g("crm:deal:read") },
    (req) => deals.list(tenantContextOf(req), accessOf(req), req.query),
  );
  r.post(
    `${P}/deals`,
    { schema: { body: createDealInputSchema }, preHandler: g("crm:deal:create") },
    async (req, reply) =>
      reply.status(201).send(await deals.create(tenantContextOf(req), accessOf(req), req.body)),
  );
  r.get(
    `${P}/deals/:id`,
    { schema: { params: idParamSchema }, preHandler: g("crm:deal:read") },
    (req) => deals.get(tenantContextOf(req), accessOf(req), req.params.id),
  );
  r.patch(
    `${P}/deals/:id`,
    {
      schema: { params: idParamSchema, body: updateDealInputSchema },
      preHandler: g("crm:deal:update"),
    },
    async (req) => {
      // Editar el importe de una oportunidad GANADA exige además `crm:deal:manage`.
      const canManage = await guard.can(req, "crm:deal:manage");
      return deals.update(
        tenantContextOf(req),
        { ...accessOf(req), canManage },
        req.params.id,
        req.body,
      );
    },
  );
  r.post(
    `${P}/deals/:id/move`,
    {
      schema: { params: idParamSchema, body: moveDealInputSchema },
      preHandler: g("crm:deal:update"),
    },
    (req) => deals.move(tenantContextOf(req), accessOf(req), req.params.id, req.body.stageId),
  );
  r.post(
    `${P}/deals/:id/win`,
    { schema: { params: idParamSchema }, preHandler: g("crm:deal:update") },
    (req) => deals.win(tenantContextOf(req), accessOf(req), req.params.id),
  );
  r.post(
    `${P}/deals/:id/lose`,
    {
      schema: { params: idParamSchema, body: loseDealInputSchema },
      preHandler: g("crm:deal:update"),
    },
    (req) => deals.lose(tenantContextOf(req), accessOf(req), req.params.id, req.body.reason),
  );
  r.post(
    `${P}/deals/:id/reopen`,
    { schema: { params: idParamSchema }, preHandler: g("crm:deal:update") },
    (req) => deals.reopen(tenantContextOf(req), accessOf(req), req.params.id),
  );
  r.delete(
    `${P}/deals/:id`,
    { schema: { params: idParamSchema }, preHandler: g("crm:deal:delete") },
    async (req, reply) => {
      await deals.delete(tenantContextOf(req), accessOf(req), req.params.id);
      return reply.status(204).send();
    },
  );

  // ── Actividad, tareas y búsqueda ──────────────────────────────────────────────────────────────
  r.get(
    `${P}/activities`,
    { schema: { querystring: activitiesQuerySchema }, preHandler: g("crm:activity:read") },
    (req) => activities.list(tenantContextOf(req), accessOf(req), req.query),
  );
  r.post(
    `${P}/activities`,
    { schema: { body: createActivityInputSchema }, preHandler: g("crm:activity:create") },
    async (req, reply) =>
      reply
        .status(201)
        .send(await activities.create(tenantContextOf(req), accessOf(req), req.body)),
  );

  r.get(
    `${P}/tasks`,
    { schema: { querystring: tasksQuerySchema }, preHandler: g("crm:task:read") },
    (req) => activities.listTasks(tenantContextOf(req), accessOf(req), req.query),
  );
  r.post(
    `${P}/tasks`,
    { schema: { body: createTaskInputSchema }, preHandler: g("crm:task:create") },
    async (req, reply) =>
      reply
        .status(201)
        .send(await activities.createTask(tenantContextOf(req), accessOf(req), req.body)),
  );
  r.patch(
    `${P}/tasks/:id`,
    {
      schema: { params: idParamSchema, body: updateTaskInputSchema },
      preHandler: g("crm:task:update"),
    },
    (req) => activities.updateTask(tenantContextOf(req), accessOf(req), req.params.id, req.body),
  );
  r.post(
    `${P}/tasks/:id/complete`,
    { schema: { params: idParamSchema }, preHandler: g("crm:task:update") },
    (req) => activities.setTaskDone(tenantContextOf(req), accessOf(req), req.params.id, true),
  );
  r.post(
    `${P}/tasks/:id/reopen`,
    { schema: { params: idParamSchema }, preHandler: g("crm:task:update") },
    (req) => activities.setTaskDone(tenantContextOf(req), accessOf(req), req.params.id, false),
  );
  r.delete(
    `${P}/tasks/:id`,
    { schema: { params: idParamSchema }, preHandler: g("crm:task:delete") },
    async (req, reply) => {
      await activities.deleteTask(tenantContextOf(req), accessOf(req), req.params.id);
      return reply.status(204).send();
    },
  );

  // ── Datos de ejemplo (onboarding): consultar / cargar / quitar ────────────────────────────────
  r.get(`${P}/sample-data`, { preHandler: g("crm:pipeline:manage") }, (req) =>
    sampleData.status(tenantContextOf(req)),
  );
  r.post(`${P}/sample-data`, { preHandler: g("crm:pipeline:manage") }, async (req, reply) =>
    reply.status(201).send(await sampleData.load(tenantContextOf(req))),
  );
  r.delete(`${P}/sample-data`, { preHandler: g("crm:pipeline:manage") }, async (req, reply) => {
    await sampleData.remove(tenantContextOf(req));
    return reply.status(204).send();
  });

  r.get(
    `${P}/search`,
    { schema: { querystring: searchQuerySchema }, preHandler: g("crm:account:read") },
    (req) => activities.search(tenantContextOf(req), accessOf(req), req.query.q),
  );
}
