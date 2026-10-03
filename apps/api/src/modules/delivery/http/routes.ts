import {
  createDeliveryTaskInputSchema,
  createMilestoneInputSchema,
  createProjectInputSchema,
  createTimeEntryInputSchema,
  projectsQuerySchema,
  updateDeliveryTaskInputSchema,
  updateMilestoneInputSchema,
  updateProjectInputSchema,
} from "@nexo/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import { type createGuards, tenantContextOf } from "../../../platform/http/guards";
import type { DeliveryService } from "../application/deliveryService";

const idParam = z.object({ id: z.string().uuid() });

/** Rutas de Delivery. El alcance `own` no restringe: los proyectos son del equipo de ejecución. */
export function registerDeliveryRoutes(
  app: FastifyInstance,
  deps: { service: DeliveryService; guard: ReturnType<typeof createGuards> },
): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  const { service, guard } = deps;
  const P = "/api/v1/delivery";
  const g = (
    permission:
      | "delivery:project:read"
      | "delivery:project:create"
      | "delivery:project:update"
      | "delivery:task:create"
      | "delivery:task:update"
      | "delivery:task:delete"
      | "delivery:time:create",
  ) => guard({ entitlement: "delivery", permission });

  r.get(
    `${P}/projects`,
    { schema: { querystring: projectsQuerySchema }, preHandler: g("delivery:project:read") },
    (req) => service.list(tenantContextOf(req), req.query),
  );
  r.post(
    `${P}/projects`,
    { schema: { body: createProjectInputSchema }, preHandler: g("delivery:project:create") },
    async (req, reply) =>
      reply.status(201).send(await service.create(tenantContextOf(req), req.body)),
  );
  r.get(
    `${P}/projects/:id`,
    { schema: { params: idParam }, preHandler: g("delivery:project:read") },
    (req) => service.detail(tenantContextOf(req), req.params.id),
  );
  r.patch(
    `${P}/projects/:id`,
    {
      schema: { params: idParam, body: updateProjectInputSchema },
      preHandler: g("delivery:project:update"),
    },
    (req) => service.update(tenantContextOf(req), req.params.id, req.body),
  );

  r.post(
    `${P}/projects/:id/milestones`,
    {
      schema: { params: idParam, body: createMilestoneInputSchema },
      preHandler: g("delivery:project:update"),
    },
    async (req, reply) =>
      reply
        .status(201)
        .send(await service.addMilestone(tenantContextOf(req), req.params.id, req.body)),
  );
  r.patch(
    `${P}/milestones/:id`,
    {
      schema: { params: idParam, body: updateMilestoneInputSchema },
      preHandler: g("delivery:project:update"),
    },
    (req) => service.updateMilestone(tenantContextOf(req), req.params.id, req.body),
  );

  r.post(
    `${P}/projects/:id/tasks`,
    {
      schema: { params: idParam, body: createDeliveryTaskInputSchema },
      preHandler: g("delivery:task:create"),
    },
    async (req, reply) =>
      reply.status(201).send(await service.addTask(tenantContextOf(req), req.params.id, req.body)),
  );
  r.patch(
    `${P}/tasks/:id`,
    {
      schema: { params: idParam, body: updateDeliveryTaskInputSchema },
      preHandler: g("delivery:task:update"),
    },
    (req) => service.updateTask(tenantContextOf(req), req.params.id, req.body),
  );
  r.delete(
    `${P}/tasks/:id`,
    { schema: { params: idParam }, preHandler: g("delivery:task:delete") },
    async (req, reply) => {
      await service.deleteTask(tenantContextOf(req), req.params.id);
      return reply.status(204).send();
    },
  );

  r.post(
    `${P}/projects/:id/time`,
    {
      schema: { params: idParam, body: createTimeEntryInputSchema },
      preHandler: g("delivery:time:create"),
    },
    async (req, reply) =>
      reply.status(201).send(await service.logTime(tenantContextOf(req), req.params.id, req.body)),
  );
}
