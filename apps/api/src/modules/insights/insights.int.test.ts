import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type Session } from "../../testing/harness";

/**
 * Insights de extremo a extremo: los read models se alimentan SOLO por eventos (outbox → suscriptores) y
 * las cifras deben coincidir con las del CRM (test de conciliación, MODULES_SPEC §7.3).
 */
let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h?.stop();
});

const crm = (
  s: Session,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  payload?: object,
) =>
  h.app.inject({
    method,
    url: `/api/v1/crm${url}`,
    headers: h.auth(s),
    ...(payload ? { payload } : {}),
  });
const overview = async (s: Session, qs = "") => {
  const r = await h.app.inject({
    method: "GET",
    url: `/api/v1/insights/overview${qs}`,
    headers: h.auth(s),
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json();
};

async function owner() {
  const s = await h.signup();
  await h.verifyEmail(s);
  return s;
}
async function newDeal(s: Session, accountId: string, amountCents: number, name = "Trato") {
  const r = await crm(s, "POST", "/deals", {
    name,
    accountId,
    amountCents,
    nextActionText: "Seguir",
    expectedCloseOn: "2026-10-25",
  });
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as { id: string };
}
const account = async (s: Session, name = "Cuenta") =>
  (await crm(s, "POST", "/accounts", { name })).json() as { id: string };

describe("panel de ventas", () => {
  it("sin datos devuelve ceros, series completas y conversión nula", async () => {
    const s = await owner();
    const o = await overview(s);
    expect(o.pipeline).toEqual({
      count: 0,
      amountCents: 0,
      weightedAmountCents: 0,
      stalledCount: 0,
    });
    expect(o.won).toEqual({ count: 0, amountCents: 0 });
    expect(o.conversionRate).toBeNull();
    expect(o.avgCycleDays).toBeNull();
    expect(o.wonByMonth).toHaveLength(8);
    expect(o.forecastByMonth).toHaveLength(4);
    expect(o.currency).toBe("EUR");
  });

  it("concilia con el CRM: abiertas, ponderado, ganadas, perdidas, conversión, ciclo y embudo", async () => {
    const s = await owner();
    await h.drainOutbox();
    const a = await account(s);
    const open1 = await newDeal(s, a.id, 1_000_000, "Abierta 1");
    const open2 = await newDeal(s, a.id, 500_000, "Abierta 2");
    const won = await newDeal(s, a.id, 2_000_000, "Ganada");
    const lost = await newDeal(s, a.id, 300_000, "Perdida");

    const pipelines = (await crm(s, "GET", "/pipelines")).json();
    const stage = (name: string) =>
      pipelines[0].stages.find((x: { name: string }) => x.name === name).id;
    await crm(s, "POST", `/deals/${open2.id}/move`, { stageId: stage("Propuesta") }); // 50 %
    await crm(s, "POST", `/deals/${won.id}/win`);
    await crm(s, "POST", `/deals/${lost.id}/lose`, { reason: "Precio" });
    await crm(s, "POST", "/activities", { kind: "call", subject: "Llamada", dealId: open1.id });
    await crm(s, "POST", "/activities", { kind: "note", subject: "Nota", dealId: open1.id });
    await h.drainOutbox();

    const o = await overview(s);
    // Pipeline abierto = lo que dice el CRM ahora mismo.
    const crmOpen = (await crm(s, "GET", "/deals?status=open")).json() as Array<{
      amountCents: number;
      probability: number;
    }>;
    expect(o.pipeline.count).toBe(crmOpen.length);
    expect(o.pipeline.amountCents).toBe(crmOpen.reduce((n, d) => n + d.amountCents, 0));
    expect(o.pipeline.weightedAmountCents).toBe(
      Math.round(crmOpen.reduce((n, d) => n + (d.amountCents * d.probability) / 100, 0)),
    );
    expect(o.pipeline).toMatchObject({
      count: 2,
      amountCents: 1_500_000,
      weightedAmountCents: 100_000 + 250_000,
    });

    expect(o.won).toEqual({ count: 1, amountCents: 2_000_000 });
    expect(o.lost).toEqual({ count: 1, amountCents: 300_000 });
    expect(o.conversionRate).toBe(0.5);
    // (el reloj de la app está fijado en el test, `created_at` viene del reloj de la BD: solo se comprueba que existe)
    expect(o.avgCycleDays).toEqual(expect.any(Number));
    expect(o.lostReasons).toEqual([{ reason: "Precio", count: 1 }]);
    expect(
      o.byStage.map((x: { stageName: string; count: number }) => [x.stageName, x.count]),
    ).toEqual([
      ["Prospecto", 1],
      ["Propuesta", 1],
    ]);
    expect(o.activity.find((x: { kind: string }) => x.kind === "call")?.count).toBe(1);
    expect(o.activity.find((x: { kind: string }) => x.kind === "note")?.count).toBe(1);
    // Ingresos ganados: el mes actual lleva los 20.000 €.
    expect(o.wonByMonth.at(-1)).toEqual({ month: "2026-10", amountCents: 2_000_000 });
    // Previsión del mes de cierre previsto (2026-10): ponderado de las dos abiertas.
    expect(o.forecastByMonth[0]).toEqual({ month: "2026-10", weightedAmountCents: 350_000 });
  });

  it("repetir la entrega de eventos no duplica nada y los eventos antiguos no pisan a los nuevos", async () => {
    const s = await owner();
    const a = await account(s);
    const d = await newDeal(s, a.id, 700_000);
    await h.drainOutbox();
    await crm(s, "PATCH", `/deals/${d.id}`, { amountCents: 900_000 });
    await h.drainOutbox();
    expect((await overview(s)).pipeline.amountCents).toBe(900_000);

    // Re-despachar todo el outbox (entrega «al menos una vez») no cambia las cifras.
    await h.env.raw.ownerPool.query(
      "update outbox_events set status = 'pending' where tenant_id = $1",
      [s.tenantId],
    );
    await h.env.raw.ownerPool.query("delete from processed_events where tenant_id = $1", [
      s.tenantId,
    ]);
    await h.drainOutbox();
    const o = await overview(s);
    expect(o.pipeline).toMatchObject({ count: 1, amountCents: 900_000 });
  });

  it("borrar una oportunidad la quita del panel (vía evento)", async () => {
    const s = await owner();
    const a = await account(s);
    const d = await newDeal(s, a.id, 123_000);
    await h.drainOutbox();
    expect((await overview(s)).pipeline.count).toBe(1);
    expect((await crm(s, "DELETE", `/deals/${d.id}`)).statusCode).toBe(204);
    await h.drainOutbox();
    expect((await overview(s)).pipeline.count).toBe(0);
  });

  it("alcance own: cada comercial ve solo lo suyo; el manager ve todo y puede filtrar por propietario", async () => {
    const o = await owner();
    const salesA = await h.addMember(o, "sales");
    const salesB = await h.addMember(o, "sales");
    const manager = await h.addMember(o, "manager");
    const accA = await account(salesA, "De A");
    const accB = await account(salesB, "De B");
    await newDeal(salesA, accA.id, 100_000);
    await newDeal(salesB, accB.id, 400_000);
    await newDeal(salesB, accB.id, 400_000);
    await h.drainOutbox();

    expect((await overview(salesA)).pipeline).toMatchObject({ count: 1, amountCents: 100_000 });
    expect((await overview(salesB)).pipeline).toMatchObject({ count: 2, amountCents: 800_000 });
    // Un comercial no puede ver el equipo pasando ownerId.
    expect((await overview(salesA, `?ownerId=${salesB.membershipId}`)).pipeline.count).toBe(1);
    expect((await overview(manager)).pipeline).toMatchObject({ count: 3, amountCents: 900_000 });
    expect((await overview(manager, `?ownerId=${salesB.membershipId}`)).pipeline.count).toBe(2);
  });

  it("aislamiento entre tenants: nunca se mezclan cifras", async () => {
    const a = await owner();
    const b = await owner();
    const accB = await account(b);
    await newDeal(b, accB.id, 5_000_000);
    await h.drainOutbox();
    expect((await overview(a)).pipeline.count).toBe(0);
    expect((await overview(b)).pipeline.amountCents).toBe(5_000_000);
  });

  it("valida el periodo y exige permiso", async () => {
    const s = await owner();
    const bad = await h.app.inject({
      method: "GET",
      url: "/api/v1/insights/overview?period=7d",
      headers: h.auth(s),
    });
    expect(bad.statusCode).toBe(400);
    const anon = await h.app.inject({ method: "GET", url: "/api/v1/insights/overview" });
    expect(anon.statusCode).toBe(401);
  });
});
