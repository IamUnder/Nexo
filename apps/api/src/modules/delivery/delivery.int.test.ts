import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type Session } from "../../testing/harness";

/** Delivery de extremo a extremo: deal ganado → proyecto (idempotente), tareas, salud, tiempo y aislamiento. */
let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h?.stop();
});

const call = (
  s: Session,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) =>
  h.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: h.auth(s),
    ...(payload ? { payload } : {}),
  });

async function owner() {
  const s = await h.signup();
  await h.verifyEmail(s);
  return s;
}

/** Crea una empresa y una oportunidad, la gana y procesa los eventos. */
async function wonDeal(s: Session, name = "Rediseño web") {
  const acc = (await call(s, "POST", "/crm/accounts", { name: "Cliente SL" })).json();
  await call(s, "POST", "/crm/contacts", {
    accountId: acc.id,
    firstName: "Eva",
    email: `eva${Math.random().toString(36).slice(2)}@c.test`,
  });
  const deal = (
    await call(s, "POST", "/crm/deals", {
      name,
      accountId: acc.id,
      amountCents: 500_000,
      nextActionText: "x",
    })
  ).json();
  await call(s, "POST", `/crm/deals/${deal.id}/win`);
  await h.drainOutbox();
  return { acc, deal };
}
const projects = async (s: Session, qs = "") =>
  (await call(s, "GET", `/delivery/projects${qs}`)).json() as Array<Record<string, unknown>>;

describe("proyecto desde un deal ganado", () => {
  it("crea el proyecto con plantilla, resumen y responsable; un deal ganado dos veces → un proyecto", async () => {
    const s = await owner();
    const { acc, deal } = await wonDeal(s);
    const list = await projects(s);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      name: "Rediseño web",
      status: "planned",
      accountId: acc.id,
      accountName: "Cliente SL",
      sourceDealId: deal.id,
      ownerId: s.membershipId,
      tasksTotal: 5,
      tasksDone: 0,
    });
    expect(list[0]?.summary).toContain("5000.00 EUR");

    const detail = (await call(s, "GET", `/delivery/projects/${list[0]?.id}`)).json();
    expect(detail.milestones.map((m: { name: string }) => m.name)).toEqual([
      "Kickoff",
      "Ejecución",
      "Entrega",
    ]);
    expect(detail.tasks).toHaveLength(5);
    expect(detail.tasks[0]).toMatchObject({ status: "todo", assigneeId: s.membershipId });

    // Reentrega del mismo evento (al menos una vez) y reapertura + nueva victoria: sigue siendo uno.
    await h.env.raw.ownerPool.query(
      "update outbox_events set status = 'pending' where tenant_id = $1",
      [s.tenantId],
    );
    await h.env.raw.ownerPool.query("delete from processed_events where tenant_id = $1", [
      s.tenantId,
    ]);
    await h.drainOutbox();
    await call(s, "POST", `/crm/deals/${deal.id}/reopen`);
    await call(s, "POST", `/crm/deals/${deal.id}/win`);
    await h.drainOutbox();
    expect(await projects(s)).toHaveLength(1);
  });

  it("filtra por cuenta, sigue el nombre de la empresa y marca la cuenta archivada al borrarla", async () => {
    const s = await owner();
    const { acc, deal } = await wonDeal(s);
    expect(await projects(s, `?accountId=${acc.id}`)).toHaveLength(1);
    expect(await projects(s, "?accountId=01a0fee6-1387-7e91-920a-9a363fca63b6")).toHaveLength(0);

    await call(s, "PATCH", `/crm/accounts/${acc.id}`, { name: "Cliente Renombrado SL" });
    await h.drainOutbox();
    expect((await projects(s))[0]).toMatchObject({
      accountName: "Cliente Renombrado SL",
      accountArchived: false,
    });

    // El deal ganado ya no cuenta como abierto: se puede borrar la empresa.
    await call(s, "DELETE", `/crm/deals/${deal.id}`);
    expect((await call(s, "DELETE", `/crm/accounts/${acc.id}`)).statusCode).toBe(204);
    await h.drainOutbox();
    expect((await projects(s))[0]).toMatchObject({
      accountName: "Cliente Renombrado SL",
      accountArchived: true,
    });
  });
});

describe("tareas, salud y tiempo", () => {
  it("completar tareas emite eventos; una tarea vencida pone el proyecto en riesgo y una bloqueada lo bloquea", async () => {
    const s = await owner();
    await wonDeal(s);
    const project = (await projects(s))[0] as { id: string };
    // Pasa a «en curso» a mano.
    expect(
      (await call(s, "PATCH", `/delivery/projects/${project.id}`, { status: "in_progress" }))
        .statusCode,
    ).toBe(200);

    const t = (
      await call(s, "POST", `/delivery/projects/${project.id}/tasks`, {
        title: "Vencida",
        dueOn: "2020-01-01",
      })
    ).json();
    let p = (await call(s, "GET", `/delivery/projects/${project.id}`)).json();
    expect(t.overdue).toBe(true);
    expect(p.project).toMatchObject({ health: "at_risk", status: "at_risk", tasksOverdue: 1 });

    await call(s, "PATCH", `/delivery/tasks/${t.id}`, { status: "blocked" });
    p = (await call(s, "GET", `/delivery/projects/${project.id}`)).json();
    expect(p.project).toMatchObject({ health: "off_track", status: "blocked" });

    await call(s, "PATCH", `/delivery/tasks/${t.id}`, { status: "done" });
    p = (await call(s, "GET", `/delivery/projects/${project.id}`)).json();
    expect(p.project).toMatchObject({ health: "on_track", status: "in_progress", tasksDone: 1 });
    expect(p.tasks.find((x: { id: string }) => x.id === t.id)?.completedAt).toBeTruthy();
    expect(await h.events(s.tenantId, "delivery.task.completed")).toHaveLength(1);
    expect(
      (await h.events(s.tenantId, "delivery.project.status_changed")).length,
    ).toBeGreaterThanOrEqual(2);

    // Borrar la tarea; hito y tarea de otro proyecto no se pueden mezclar.
    expect((await call(s, "DELETE", `/delivery/tasks/${t.id}`)).statusCode).toBe(204);
    const other = (await call(s, "POST", "/delivery/projects", { name: "Otro" })).json();
    const m = (
      await call(s, "POST", `/delivery/projects/${other.id}/milestones`, { name: "Hito ajeno" })
    ).json();
    const bad = await call(s, "POST", `/delivery/projects/${project.id}/tasks`, {
      title: "x",
      milestoneId: m.id,
    });
    expect(bad.statusCode).toBe(404);
  });

  it("completar el proyecto emite delivery.project.completed; el tiempo se acumula", async () => {
    const s = await owner();
    const p = (
      await call(s, "POST", "/delivery/projects", { name: "Manual", dueOn: "2026-12-31" })
    ).json();
    expect(p).toMatchObject({ status: "planned", ownerId: s.membershipId, dueOn: "2026-12-31" });
    const t = (
      await call(s, "POST", `/delivery/projects/${p.id}/tasks`, { title: "Trabajo" })
    ).json();

    expect(
      (
        await call(s, "POST", `/delivery/projects/${p.id}/time`, {
          taskId: t.id,
          minutes: 90,
          note: "Diseño",
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (await call(s, "POST", `/delivery/projects/${p.id}/time`, { minutes: 30 })).statusCode,
    ).toBe(201);
    expect(
      (await call(s, "POST", `/delivery/projects/${p.id}/time`, { minutes: 0 })).statusCode,
    ).toBe(400);
    const d = (await call(s, "GET", `/delivery/projects/${p.id}`)).json();
    expect(d.project.minutesLogged).toBe(120);
    expect(d.time).toHaveLength(2);
    expect(d.time[0].membershipName).toBe("Persona Prueba");

    await call(s, "PATCH", `/delivery/projects/${p.id}`, { status: "done" });
    expect(await h.events(s.tenantId, "delivery.project.completed")).toHaveLength(1);
    expect((await call(s, "PATCH", `/delivery/projects/${p.id}`, {})).statusCode).toBe(400);
  });
});

describe("permisos y aislamiento", () => {
  it("un comercial solo lee; operaciones trabaja pero no borra tareas ni proyectos; manager todo", async () => {
    const o = await owner();
    const sales = await h.addMember(o, "sales");
    const delivery = await h.addMember(o, "delivery");
    const p = (await call(o, "POST", "/delivery/projects", { name: "Proyecto P" })).json();

    expect((await call(sales, "GET", "/delivery/projects")).statusCode).toBe(200);
    expect((await call(sales, "POST", "/delivery/projects", { name: "xx" })).statusCode).toBe(403);
    expect(
      (await call(sales, "POST", `/delivery/projects/${p.id}/tasks`, { title: "x" })).statusCode,
    ).toBe(403);

    const t = await call(delivery, "POST", `/delivery/projects/${p.id}/tasks`, { title: "Mía" });
    expect(t.statusCode).toBe(201);
    expect(
      (await call(delivery, "POST", `/delivery/projects/${p.id}/time`, { minutes: 15 })).statusCode,
    ).toBe(201);
    expect((await call(delivery, "DELETE", `/delivery/tasks/${t.json().id}`)).statusCode).toBe(403);
  });

  it("un tenant no ve ni toca los proyectos de otro", async () => {
    const a = await owner();
    const b = await owner();
    const p = (await call(b, "POST", "/delivery/projects", { name: "Secreto B" })).json();
    const t = (await call(b, "POST", `/delivery/projects/${p.id}/tasks`, { title: "T" })).json();
    expect(await projects(a)).toHaveLength(0);
    for (const [method, url] of [
      ["GET", `/delivery/projects/${p.id}`],
      ["PATCH", `/delivery/projects/${p.id}`],
      ["POST", `/delivery/projects/${p.id}/tasks`],
      ["POST", `/delivery/projects/${p.id}/time`],
      ["PATCH", `/delivery/tasks/${t.id}`],
      ["DELETE", `/delivery/tasks/${t.id}`],
    ] as const) {
      const payload =
        method === "PATCH"
          ? url.includes("/tasks/")
            ? { title: "x" }
            : { name: "xx" }
          : url.endsWith("/time")
            ? { minutes: 5 }
            : url.endsWith("/tasks")
              ? { title: "x" }
              : undefined;
      expect((await call(a, method, url, payload)).statusCode, `${method} ${url}`).toBe(404);
    }
    expect((await call(b, "GET", `/delivery/projects/${p.id}`)).json().project.name).toBe(
      "Secreto B",
    );
  });
});
