import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type Session } from "../../testing/harness";

/**
 * CRM de extremo a extremo (HTTP real + PostgreSQL real). Cubre los criterios de aceptación de
 * MODULES_SPEC §3: ciclo de oportunidades, eventos, alcance own/all, permisos y aislamiento entre tenants.
 */
let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h?.stop();
});

const call = (
  s: Session,
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  url: string,
  payload?: object,
) =>
  h.app.inject({
    method,
    url: `/api/v1/crm${url}`,
    headers: h.auth(s),
    ...(payload ? { payload } : {}),
  });

const tomorrow = () => new Date(h.clock.now().getTime() + 86_400_000).toISOString();

async function owner() {
  const s = await h.signup();
  await h.verifyEmail(s);
  return s;
}
async function account(s: Session, name = "Acme Digital", extra: object = {}) {
  const r = await call(s, "POST", "/accounts", { name, ...extra });
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string; name: string };
}
async function deal(s: Session, accountId: string, extra: object = {}) {
  const r = await call(s, "POST", "/deals", {
    name: "Proyecto web",
    accountId,
    amountCents: 1_200_000,
    nextActionText: "Enviar propuesta",
    ...extra,
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string; stageId: string; pipelineId: string; status: string };
}
async function pipeline(s: Session) {
  const r = await call(s, "GET", "/pipelines");
  expect(r.statusCode, r.body).toBe(200);
  return r.json()[0] as {
    id: string;
    stages: Array<{ id: string; name: string; kind: string; probability: number }>;
  };
}

describe("pipeline por defecto", () => {
  it("todo tenant nace con su pipeline de ventas (vía evento) y las etapas de cierre", async () => {
    const s = await owner();
    await h.drainOutbox();
    const p = await pipeline(s);
    expect(p.stages.map((x) => x.name)).toEqual([
      "Prospecto",
      "Cualificado",
      "Propuesta",
      "Negociación",
      "Ganada",
      "Perdida",
    ]);
    expect(p.stages.map((x) => x.kind)).toEqual(["open", "open", "open", "open", "won", "lost"]);
    // Idempotente: pedirlo otra vez no crea otro.
    expect((await call(s, "GET", "/pipelines")).json()).toHaveLength(1);
  });

  it("se crea también de forma perezosa si el evento aún no se procesó", async () => {
    const s = await h.signup();
    expect((await call(s, "GET", "/pipelines")).json()).toHaveLength(1);
  });
});

describe("empresas", () => {
  it("crea, lee, edita, busca, pagina y borra (lógico)", async () => {
    const s = await owner();
    const a = await account(s, "Ñandú Tecnologías S.L.", {
      domain: "NANDU.test",
      taxId: "B12345678",
    });
    expect(a.name).toBe("Ñandú Tecnologías S.L.");

    const got = (await call(s, "GET", `/accounts/${a.id}`)).json();
    expect(got).toMatchObject({
      domain: "nandu.test",
      contactsCount: 0,
      openDealsCount: 0,
      status: "prospect",
    });
    expect(got.ownerId).toBe(s.membershipId);
    expect(got.ownerName).toBe("Persona Prueba");

    const upd = await call(s, "PATCH", `/accounts/${a.id}`, {
      status: "active",
      industry: "Software",
    });
    expect(upd.json()).toMatchObject({ status: "active", industry: "Software" });

    // Búsqueda tolerante a tildes y mayúsculas, y por dominio / NIF.
    for (const q of ["nandu", "ÑANDÚ", "nandu.test", "b1234"]) {
      const r = (await call(s, "GET", `/accounts?search=${encodeURIComponent(q)}`)).json();
      expect(
        r.items.map((x: { id: string }) => x.id),
        q,
      ).toContain(a.id);
    }
    expect((await call(s, "GET", `/accounts?search=zzzzinexistente`)).json().items).toHaveLength(0);

    // Paginación por cursor.
    for (let i = 0; i < 5; i++) await account(s, `Cuenta paginada ${i}`);
    const p1 = (await call(s, "GET", "/accounts?limit=3")).json();
    expect(p1.items).toHaveLength(3);
    expect(p1.nextCursor).toBeTruthy();
    const p2 = (await call(s, "GET", `/accounts?limit=3&cursor=${p1.nextCursor}`)).json();
    const ids = new Set([...p1.items, ...p2.items].map((x: { id: string }) => x.id));
    expect(ids.size).toBe(p1.items.length + p2.items.length); // sin repetidos

    expect((await call(s, "DELETE", `/accounts/${a.id}`)).statusCode).toBe(204);
    expect((await call(s, "GET", `/accounts/${a.id}`)).statusCode).toBe(404);
    expect((await call(s, "GET", `/accounts?search=nandu`)).json().items).toHaveLength(0);
  });

  it("valida los datos y no acepta un propietario que no es miembro", async () => {
    const s = await owner();
    expect((await call(s, "POST", "/accounts", { name: "x" })).statusCode).toBe(400);
    expect((await call(s, "PATCH", `/accounts/${(await account(s)).id}`, {})).statusCode).toBe(400);
    const other = await h.signup();
    const r = await call(s, "POST", "/accounts", {
      name: "Con dueño ajeno",
      ownerId: other.membershipId,
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().error.code).toBe("crm.invalid_owner");
  });

  it("no se borra una empresa con oportunidades abiertas", async () => {
    const s = await owner();
    const a = await account(s);
    const d = await deal(s, a.id);
    const r = await call(s, "DELETE", `/accounts/${a.id}`);
    expect(r.statusCode).toBe(409);
    expect(r.json().error.code).toBe("crm.account_has_open_deals");
    await call(s, "POST", `/deals/${d.id}/lose`, { reason: "Presupuesto cancelado" });
    expect((await call(s, "DELETE", `/accounts/${a.id}`)).statusCode).toBe(204);
  });
});

describe("contactos", () => {
  it("crea contactos vinculados a empresa, rechaza emails duplicados y los edita", async () => {
    const s = await owner();
    const a = await account(s);
    const c = await call(s, "POST", "/contacts", {
      accountId: a.id,
      firstName: "Ana",
      lastName: "Torres",
      email: "Ana@Acme.test",
    });
    expect(c.statusCode, c.body).toBe(201);
    expect(c.json()).toMatchObject({
      fullName: "Ana Torres",
      email: "ana@acme.test",
      accountName: "Acme Digital",
    });

    const dup = await call(s, "POST", "/contacts", { firstName: "Otra", email: "ANA@acme.test" });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe("crm.contact_email_taken");

    expect((await call(s, "GET", `/accounts/${a.id}`)).json().contactsCount).toBe(1);
    const upd = await call(s, "PATCH", `/contacts/${c.json().id}`, { jobTitle: "CTO" });
    expect(upd.json().jobTitle).toBe("CTO");
    const conflict = await call(s, "POST", "/contacts", {
      firstName: "Luis",
      email: "luis@acme.test",
    });
    expect(
      (await call(s, "PATCH", `/contacts/${conflict.json().id}`, { email: "ana@acme.test" }))
        .statusCode,
    ).toBe(409);

    expect((await call(s, "GET", `/contacts?accountId=${a.id}`)).json().items).toHaveLength(1);
    expect((await call(s, "DELETE", `/contacts/${c.json().id}`)).statusCode).toBe(204);
    // Tras borrar, el email vuelve a estar disponible.
    expect(
      (await call(s, "POST", "/contacts", { firstName: "Ana", email: "ana@acme.test" })).statusCode,
    ).toBe(201);
  });

  it("no permite vincular un contacto a una empresa que no existe", async () => {
    const s = await owner();
    const r = await call(s, "POST", "/contacts", {
      accountId: "01a0fee6-1387-7e91-920a-9a363fca63b6",
      firstName: "Ana",
    });
    expect(r.statusCode).toBe(404);
  });
});

describe("oportunidades", () => {
  it("exige la siguiente acción en abiertas y crea en la primera etapa con su probabilidad", async () => {
    const s = await owner();
    const a = await account(s);
    const sin = await call(s, "POST", "/deals", { name: "Sin acción", accountId: a.id });
    expect(sin.statusCode).toBe(400);
    expect(sin.json().error.code).toBe("deal.next_action_required");

    const d = await call(s, "POST", "/deals", {
      name: "Con fecha",
      accountId: a.id,
      nextActionAt: tomorrow(),
      amountCents: 500_000,
    });
    expect(d.statusCode, d.body).toBe(201);
    expect(d.json()).toMatchObject({
      stageName: "Prospecto",
      probability: 10,
      status: "open",
      currency: "EUR",
      amountCents: 500_000,
      ownerId: s.membershipId,
    });
  });

  it("ciclo completo: mover entre etapas deja timeline, ganar emite crm.deal.won con los contactos", async () => {
    const s = await owner();
    const a = await account(s, "Cliente Final");
    const contact = (
      await call(s, "POST", "/contacts", {
        accountId: a.id,
        firstName: "Eva",
        lastName: "Ruiz",
        email: "eva@cliente.test",
      })
    ).json();
    const d = await deal(s, a.id, { primaryContactId: contact.id });
    const p = await pipeline(s);
    const stage = (name: string) => p.stages.find((x) => x.name === name)?.id as string;

    const moved = await call(s, "POST", `/deals/${d.id}/move`, { stageId: stage("Propuesta") });
    expect(moved.json()).toMatchObject({ stageName: "Propuesta", probability: 50, status: "open" });
    await call(s, "POST", `/deals/${d.id}/move`, { stageId: stage("Negociación") });

    const timeline = (await call(s, "GET", `/activities?dealId=${d.id}`)).json();
    expect(
      timeline
        .filter((x: { kind: string }) => x.kind === "stage_change")
        .map((x: { subject: string }) => x.subject),
    ).toEqual(["Propuesta → Negociación", "Prospecto → Propuesta"]);
    // El timeline de la CUENTA incluye lo de sus oportunidades.
    expect(
      (await call(s, "GET", `/activities?accountId=${a.id}`)).json().length,
    ).toBeGreaterThanOrEqual(2);

    const won = await call(s, "POST", `/deals/${d.id}/win`);
    expect(won.json()).toMatchObject({ status: "won", stageName: "Ganada", probability: 100 });
    expect(won.json().closedAt).toBeTruthy();

    const [evt] = await h.events(s.tenantId, "crm.deal.won");
    expect(evt?.payload).toMatchObject({
      dealId: d.id,
      accountName: "Cliente Final",
      primaryContactId: contact.id,
      status: "won",
      amountCents: 1_200_000,
    });
    expect(((evt?.payload.contacts ?? []) as Array<{ email: string }>)[0]?.email).toBe(
      "eva@cliente.test",
    );

    // Cerrada: no se mueve; hay que reabrirla.
    const again = await call(s, "POST", `/deals/${d.id}/move`, { stageId: stage("Propuesta") });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("deal.already_closed");
    expect((await call(s, "POST", `/deals/${d.id}/win`)).statusCode).toBe(409);

    const re = await call(s, "POST", `/deals/${d.id}/reopen`);
    expect(re.json()).toMatchObject({ status: "open", stageName: "Prospecto", closedAt: null });
    expect((await call(s, "POST", `/deals/${d.id}/reopen`)).statusCode).toBe(409);
  });

  it("perder exige motivo; mover a la etapa «perdida» sin motivo se rechaza", async () => {
    const s = await owner();
    const a = await account(s);
    const d = await deal(s, a.id);
    const p = await pipeline(s);
    const lostStage = p.stages.find((x) => x.kind === "lost")?.id as string;

    const noReason = await call(s, "POST", `/deals/${d.id}/move`, { stageId: lostStage });
    expect(noReason.statusCode).toBe(400);
    expect(noReason.json().error.code).toBe("deal.lost_reason_required");
    expect((await call(s, "POST", `/deals/${d.id}/lose`, { reason: "x" })).statusCode).toBe(400);

    const lost = await call(s, "POST", `/deals/${d.id}/lose`, {
      reason: "Eligió a la competencia",
    });
    expect(lost.json()).toMatchObject({
      status: "lost",
      lostReason: "Eligió a la competencia",
      probability: 0,
    });
    const [evt] = await h.events(s.tenantId, "crm.deal.lost");
    expect(evt?.payload).toMatchObject({ dealId: d.id, lostReason: "Eligió a la competencia" });
  });

  it("no se mueve a una etapa de otro pipeline ni a una inexistente", async () => {
    const s = await owner();
    const a = await account(s);
    const d = await deal(s, a.id);
    const created = await call(s, "POST", "/pipelines", { name: "Renovaciones" });
    expect(created.statusCode).toBe(201);
    const foreign = created.json().stages[0].id;
    expect((await call(s, "POST", `/deals/${d.id}/move`, { stageId: foreign })).statusCode).toBe(
      400,
    );
    expect(
      (
        await call(s, "POST", `/deals/${d.id}/move`, {
          stageId: "01a0fee6-1387-7e91-920a-9a363fca63b6",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("el importe de una oportunidad ganada solo lo cambia quien tiene crm:deal:manage", async () => {
    const o = await owner();
    const sales = await h.addMember(o, "sales");
    const a = await account(sales);
    const d = await deal(sales, a.id);
    await call(sales, "POST", `/deals/${d.id}/win`);

    const denied = await call(sales, "PATCH", `/deals/${d.id}`, { amountCents: 9_999_999 });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe("deal.closed_amount_locked");
    // Otros campos sí.
    expect((await call(sales, "PATCH", `/deals/${d.id}`, { name: "Renombrada" })).statusCode).toBe(
      200,
    );
    // El propietario del tenant sí puede.
    const ok = await call(o, "PATCH", `/deals/${d.id}`, { amountCents: 9_999_999 });
    expect(ok.statusCode, ok.body).toBe(200);
    expect(ok.json().amountCents).toBe(9_999_999);
  });

  it("el embudo lista por etapa, con filtros por estado y búsqueda", async () => {
    const s = await owner();
    const a = await account(s, "Cuenta embudo");
    const d1 = await deal(s, a.id, { name: "Rediseño de marca" });
    await deal(s, a.id, { name: "Mantenimiento anual" });
    await call(s, "POST", `/deals/${d1.id}/win`);

    const open = (await call(s, "GET", "/deals?status=open")).json();
    expect(open.map((x: { name: string }) => x.name)).toEqual(["Mantenimiento anual"]);
    const found = (await call(s, "GET", `/deals?search=${encodeURIComponent("rediseno")}`)).json();
    expect(found.map((x: { name: string }) => x.name)).toEqual(["Rediseño de marca"]);
    expect((await call(s, "GET", `/deals?accountId=${a.id}`)).json()).toHaveLength(2);
    expect((await call(s, "GET", `/accounts/${a.id}`)).json()).toMatchObject({
      openDealsCount: 1,
      openDealsAmountCents: 1_200_000,
    });
  });
});

describe("pipelines configurables", () => {
  it("renombrar, añadir y reordenar etapas; no se elimina una con oportunidades", async () => {
    const s = await owner();
    const a = await account(s);
    const d = await deal(s, a.id);
    const p = await pipeline(s);

    const edited = await call(s, "PUT", `/pipelines/${p.id}/stages`, {
      name: "Ventas B2B",
      stages: [
        { id: p.stages[0]?.id, name: "Lead", probability: 5, kind: "open" },
        { name: "Demo", probability: 30, kind: "open" },
        { id: p.stages[2]?.id, name: "Propuesta", probability: 55, kind: "open" },
        { id: p.stages[4]?.id, name: "Cerrada ganada", probability: 100, kind: "won" },
        { id: p.stages[5]?.id, name: "Cerrada perdida", probability: 0, kind: "lost" },
      ],
    });
    expect(edited.statusCode, edited.body).toBe(200);
    expect(edited.json().name).toBe("Ventas B2B");
    expect(edited.json().stages.map((x: { name: string }) => x.name)).toEqual([
      "Lead",
      "Demo",
      "Propuesta",
      "Cerrada ganada",
      "Cerrada perdida",
    ]);

    // «Lead» (antes Prospecto) conserva su id y la oportunidad que tenía.
    const board = (await call(s, "GET", "/deals")).json();
    expect(board.find((x: { id: string }) => x.id === d.id).stageName).toBe("Lead");

    // Quitar la etapa que contiene la oportunidad se rechaza.
    const current = edited.json();
    const blocked = await call(s, "PUT", `/pipelines/${p.id}/stages`, {
      stages: current.stages
        .filter((x: { name: string }) => x.name !== "Lead")
        .map((x: { id: string; name: string; probability: number; kind: string }) => ({
          id: x.id,
          name: x.name,
          probability: x.probability,
          kind: x.kind,
        })),
    });
    expect(blocked.statusCode, blocked.body).toBe(409);
    expect(blocked.json().error.code).toBe("crm.stage_has_deals");
  });

  it("rechaza configuraciones inválidas (sin ganada/perdida, nombres repetidos, etapas de otro pipeline)", async () => {
    const s = await owner();
    const p = await pipeline(s);
    const put = (stages: object[]) => call(s, "PUT", `/pipelines/${p.id}/stages`, { stages });
    const bad = await put([
      { name: "A", probability: 10, kind: "open" },
      { name: "B", probability: 20, kind: "open" },
      { name: "C", probability: 30, kind: "open" },
    ]);
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.code).toBe("crm.invalid_stages");
    const dup = await put([
      { name: "A", probability: 10, kind: "open" },
      { name: "a", probability: 20, kind: "open" },
      { name: "G", probability: 100, kind: "won" },
      { name: "P", probability: 0, kind: "lost" },
    ]);
    expect(dup.json().error.code).toBe("crm.invalid_stages");
    const other = await owner();
    const otherP = await pipeline(other);
    const foreign = await put([
      { id: otherP.stages[0]?.id, name: "Robada", probability: 10, kind: "open" },
      { name: "X", probability: 20, kind: "open" },
      { name: "G", probability: 100, kind: "won" },
      { name: "P", probability: 0, kind: "lost" },
    ]);
    expect(foreign.statusCode).toBe(404);
  });
});

describe("tareas y actividad", () => {
  it("crea, lista las propias, completa (con evento) y reabre", async () => {
    const s = await owner();
    const a = await account(s);
    const t = await call(s, "POST", "/tasks", {
      title: "Llamar al cliente",
      dueAt: tomorrow(),
      accountId: a.id,
      priority: "high",
    });
    expect(t.statusCode, t.body).toBe(201);
    expect(t.json()).toMatchObject({
      status: "open",
      assigneeId: s.membershipId,
      accountName: "Acme Digital",
    });

    const lt = await call(s, "GET", "/tasks?status=open");
    expect(lt.statusCode, lt.body).toBe(200);
    expect(lt.json().map((x: { id: string }) => x.id)).toContain(t.json().id);
    const done = await call(s, "POST", `/tasks/${t.json().id}/complete`);
    expect(done.json()).toMatchObject({ status: "done" });
    expect(done.json().completedAt).toBeTruthy();
    expect(await h.events(s.tenantId, "crm.task.completed")).toHaveLength(1);
    // Completar dos veces no duplica el evento.
    await call(s, "POST", `/tasks/${t.json().id}/complete`);
    expect(await h.events(s.tenantId, "crm.task.completed")).toHaveLength(1);

    expect((await call(s, "POST", `/tasks/${t.json().id}/reopen`)).json().status).toBe("open");
    expect((await call(s, "DELETE", `/tasks/${t.json().id}`)).statusCode).toBe(204);
  });

  it("registra notas y llamadas en la oportunidad y aparecen en la cuenta", async () => {
    const s = await owner();
    const a = await account(s);
    const d = await deal(s, a.id);
    const n = await call(s, "POST", "/activities", {
      kind: "call",
      subject: "Llamada de seguimiento",
      body: "Interesados en el plan Flow",
      dealId: d.id,
    });
    expect(n.statusCode, n.body).toBe(201);
    expect(n.json()).toMatchObject({
      kind: "call",
      accountId: a.id,
      dealId: d.id,
      authorName: "Persona Prueba",
      source: "user",
    });
    expect(
      (await call(s, "GET", `/activities?accountId=${a.id}`))
        .json()
        .map((x: { subject: string }) => x.subject),
    ).toContain("Llamada de seguimiento");
    expect(
      (await call(s, "POST", "/activities", { kind: "note", subject: "Sin entidad" })).statusCode,
    ).toBe(400);
  });
});

describe("permisos y alcance", () => {
  it("un viewer solo lee; delivery lee el CRM y puede crear tareas pero no empresas", async () => {
    const o = await owner();
    const a = await account(o);
    const viewer = await h.addMember(o, "viewer");
    const delivery = await h.addMember(o, "delivery");

    expect((await call(viewer, "GET", "/accounts")).statusCode).toBe(200);
    expect((await call(viewer, "POST", "/accounts", { name: "Nueva" })).statusCode).toBe(403);
    expect((await call(viewer, "POST", "/tasks", { title: "x" })).statusCode).toBe(403);
    expect((await call(delivery, "POST", "/accounts", { name: "Nueva" })).statusCode).toBe(403);
    expect((await call(delivery, "POST", "/tasks", { title: "Preparar kickoff" })).statusCode).toBe(
      201,
    );
    expect((await call(delivery, "DELETE", `/accounts/${a.id}`)).statusCode).toBe(403);
  });

  it("alcance own: un comercial solo ve, edita y busca lo suyo; un manager ve todo", async () => {
    const o = await owner();
    const salesA = await h.addMember(o, "sales");
    const salesB = await h.addMember(o, "sales");
    const manager = await h.addMember(o, "manager");

    const accA = await account(salesA, "Cuenta de A");
    const accB = await account(salesB, "Cuenta de B");
    const dealB = await deal(salesB, accB.id, { name: "Trato de B" });

    // A solo ve lo suyo en listados, por id y en la búsqueda.
    expect(
      (await call(salesA, "GET", "/accounts")).json().items.map((x: { id: string }) => x.id),
    ).toEqual([accA.id]);
    expect((await call(salesA, "GET", `/accounts/${accB.id}`)).statusCode).toBe(404);
    expect(
      (await call(salesA, "PATCH", `/accounts/${accB.id}`, { name: "Hackeada" })).statusCode,
    ).toBe(404);
    expect((await call(salesA, "GET", `/deals/${dealB.id}`)).statusCode).toBe(404);
    expect((await call(salesA, "POST", `/deals/${dealB.id}/win`)).statusCode).toBe(404);
    const search = (await call(salesA, "GET", "/search?q=Cuenta")).json();
    expect(search.map((x: { id: string }) => x.id)).toEqual([accA.id]);
    // No puede crear un trato sobre una cuenta ajena, ni asignar registros a otro miembro.
    expect(
      (
        await call(salesA, "POST", "/deals", {
          name: "Intruso",
          accountId: accB.id,
          nextActionText: "x",
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await call(salesA, "POST", "/accounts", { name: "Para B", ownerId: salesB.membershipId }))
        .statusCode,
    ).toBe(403);
    // Ni leer la actividad de un registro ajeno.
    expect((await call(salesA, "GET", `/activities?dealId=${dealB.id}`)).statusCode).toBe(404);

    // El manager ve todo.
    const all = (await call(manager, "GET", "/accounts?limit=100"))
      .json()
      .items.map((x: { id: string }) => x.id);
    expect(all).toEqual(expect.arrayContaining([accA.id, accB.id]));
    expect((await call(manager, "GET", `/deals/${dealB.id}`)).statusCode).toBe(200);
  });

  it("un comercial solo completa/edita sus propias tareas", async () => {
    const o = await owner();
    const a = await h.addMember(o, "sales");
    const b = await h.addMember(o, "sales");
    const t = (await call(b, "POST", "/tasks", { title: "Tarea de B" })).json();
    expect((await call(a, "POST", `/tasks/${t.id}/complete`)).statusCode).toBe(404);
    expect((await call(a, "PATCH", `/tasks/${t.id}`, { title: "x" })).statusCode).toBe(404);
    expect((await call(a, "GET", "/tasks?assignee=all")).json()).toHaveLength(0);
    expect(
      (await call(o, "GET", "/tasks?assignee=all")).json().map((x: { id: string }) => x.id),
    ).toContain(t.id);
  });
});

describe("aislamiento total entre tenants (CRM)", () => {
  it("un usuario de A no ve ni toca empresas, contactos, oportunidades, tareas ni actividad de B", async () => {
    const a = await owner();
    const b = await owner();
    const accB = await account(b, "Secreta de B");
    const contactB = (
      await call(b, "POST", "/contacts", {
        accountId: accB.id,
        firstName: "Zoe",
        email: "zoe@b.test",
      })
    ).json();
    const dealB = await deal(b, accB.id, { name: "Trato secreto" });
    const taskB = (
      await call(b, "POST", "/tasks", { title: "Tarea secreta", dealId: dealB.id })
    ).json();
    await call(b, "POST", "/activities", {
      kind: "note",
      subject: "Nota secreta",
      dealId: dealB.id,
    });

    // Listados y búsqueda: nada de B.
    for (const url of ["/accounts", "/contacts", "/deals", "/tasks?assignee=all"]) {
      const body = (await call(a, "GET", url)).json();
      expect(JSON.stringify(body), url).not.toMatch(/secret|zoe@b/i);
    }
    expect((await call(a, "GET", "/search?q=secreta")).json()).toHaveLength(0);
    expect((await call(a, "GET", "/search?q=zoe")).json()).toHaveLength(0);

    // Acceso directo por id → 404 en todo (no 403: no se revela la existencia).
    for (const [method, url] of [
      ["GET", `/accounts/${accB.id}`],
      ["PATCH", `/accounts/${accB.id}`],
      ["DELETE", `/accounts/${accB.id}`],
      ["GET", `/contacts/${contactB.id}`],
      ["PATCH", `/contacts/${contactB.id}`],
      ["DELETE", `/contacts/${contactB.id}`],
      ["GET", `/deals/${dealB.id}`],
      ["PATCH", `/deals/${dealB.id}`],
      ["POST", `/deals/${dealB.id}/win`],
      ["DELETE", `/deals/${dealB.id}`],
      ["PATCH", `/tasks/${taskB.id}`],
      ["POST", `/tasks/${taskB.id}/complete`],
      ["DELETE", `/tasks/${taskB.id}`],
    ] as const) {
      const payload =
        method === "PATCH"
          ? url.includes("/tasks/")
            ? { title: "x" }
            : url.includes("/contacts/")
              ? { firstName: "x" }
              : { name: "xx" }
          : undefined;
      const r = await call(a, method, url, payload);
      expect(r.statusCode, `${method} ${url}`).toBe(404);
    }
    expect((await call(a, "GET", `/activities?dealId=${dealB.id}`)).json()).toHaveLength(0);

    // No se puede crear nada que cuelgue de un registro de B (ni a nivel BD: FK compuestas).
    expect(
      (await call(a, "POST", "/contacts", { accountId: accB.id, firstName: "Intruso" })).statusCode,
    ).toBe(404);
    expect(
      (await call(a, "POST", "/deals", { name: "xx", accountId: accB.id, nextActionText: "y" }))
        .statusCode,
    ).toBe(404);
    expect((await call(a, "POST", "/tasks", { title: "x", dealId: dealB.id })).statusCode).toBe(
      404,
    );
    expect(
      (await call(a, "POST", "/activities", { kind: "note", subject: "x", dealId: dealB.id }))
        .statusCode,
    ).toBe(404);

    // Y B conserva todo intacto.
    expect((await call(b, "GET", `/accounts/${accB.id}`)).json().name).toBe("Secreta de B");
    expect((await call(b, "GET", `/deals/${dealB.id}`)).json().status).toBe("open");
  });

  it("las FK compuestas impiden a nivel de BD referenciar filas de otro tenant", async () => {
    const a = await owner();
    const b = await owner();
    const accB = await account(b, "De B");
    const pB = await pipeline(b);
    await expect(
      h.env.raw.ownerPool.query(
        `insert into crm_deals (tenant_id, name, account_id, pipeline_id, stage_id) values ($1, 'x', $2, $3, $4)`,
        [a.tenantId, accB.id, pB.id, pB.stages[0]?.id],
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it("los pipelines de cada tenant son independientes", async () => {
    const a = await owner();
    const b = await owner();
    const pa = await pipeline(a);
    const pb = await pipeline(b);
    expect(pa.id).not.toBe(pb.id);
    expect(
      (
        await call(a, "PUT", `/pipelines/${pb.id}/stages`, {
          stages: pb.stages.map((s) => ({
            id: s.id,
            name: s.name,
            probability: s.probability,
            kind: s.kind,
          })),
        })
      ).statusCode,
    ).toBe(404);
  });
});
