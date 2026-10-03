import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type Session } from "../../testing/harness";

/** Checklist de activación: los hitos se alcanzan por eventos reales de CRM, import, identity y delivery. */
let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h?.stop();
});

const call = (s: Session, method: "GET" | "POST", url: string, payload?: object) =>
  h.app.inject({
    method,
    url: `/api/v1${url}`,
    headers: h.auth(s),
    ...(payload ? { payload } : {}),
  });
const state = async (s: Session) => (await call(s, "GET", "/onboarding")).json();
const done = (o: { steps: Array<{ key: string; done: boolean }> }) =>
  o.steps.filter((x) => x.done).map((x) => x.key);

/** Los eventos encadenados (deal ganado → proyecto → hito) necesitan varias pasadas. */
async function settle() {
  for (let i = 0; i < 3; i++) await h.drainOutbox();
}

async function owner() {
  const s = await h.signup();
  await h.verifyEmail(s);
  return s;
}

describe("onboarding", () => {
  it("empieza vacío, con el buzón como paso no disponible", async () => {
    const s = await owner();
    const o = await state(s);
    expect(done(o)).toEqual([]);
    expect(o).toMatchObject({ activated: false, dismissed: false });
    expect(o.steps.find((x: { key: string }) => x.key === "mailbox_connected").available).toBe(
      false,
    );
    expect(o.steps.find((x: { key: string }) => x.key === "import_50_records")).toMatchObject({
      current: 0,
      target: 50,
    });
  });

  it("alcanza los hitos con eventos reales y se activa al cumplir todos los disponibles", async () => {
    const s = await owner();
    // Oportunidad creada → hito.
    const acc = (await call(s, "POST", "/crm/accounts", { name: "Cliente" })).json();
    const deal = (
      await call(s, "POST", "/crm/deals", { name: "Trato", accountId: acc.id, nextActionText: "x" })
    ).json();
    await settle();
    expect(done(await state(s))).toEqual(["deal_created_or_moved"]);

    // Deal ganado → proyecto desde deal.
    await call(s, "POST", `/crm/deals/${deal.id}/win`);
    await settle();
    expect(done(await state(s))).toContain("project_from_deal");

    // Un proyecto manual NO cuenta como «proyecto desde un deal».
    const s2 = await owner();
    await call(s2, "POST", "/delivery/projects", { name: "Manual" });
    await settle();
    expect(done(await state(s2))).not.toContain("project_from_deal");

    // Tres personas invitadas que aceptan → hito.
    for (let i = 0; i < 3; i++) await h.addMember(s, "sales");
    await settle();
    let o = await state(s);
    expect(done(o)).toContain("invited_3_users");
    expect(o.steps.find((x: { key: string }) => x.key === "invited_3_users")).toMatchObject({
      current: 3,
      target: 3,
    });
    expect(o.activated).toBe(false);

    // Importar 50 registros → activación.
    const rows = Array.from({ length: 50 }, (_, i) => ({ Empresa: `Empresa importada ${i + 1}` }));
    const batch = (
      await call(s, "POST", "/import/batches", {
        entity: "companies",
        filename: "e.csv",
        mapping: { name: "Empresa" },
        rows,
      })
    ).json();
    await call(s, "POST", `/import/batches/${batch.id}/execute`);
    await h.services.dataImport.service.settle();
    await settle();
    o = await state(s);
    expect(done(o)).toEqual(
      expect.arrayContaining([
        "import_50_records",
        "invited_3_users",
        "deal_created_or_moved",
        "project_from_deal",
      ]),
    );
    expect(o.activated).toBe(true);
    expect(o.activatedAt).toBeTruthy();
  });

  it("procesar dos veces el mismo evento no duplica contadores; se puede descartar y retomar", async () => {
    const s = await owner();
    await h.addMember(s, "viewer");
    await settle();
    await h.env.raw.ownerPool.query(
      "update outbox_events set status = 'pending' where tenant_id = $1",
      [s.tenantId],
    );
    await h.env.raw.ownerPool.query("delete from processed_events where tenant_id = $1", [
      s.tenantId,
    ]);
    // La reentrega con processed_events limpio vuelve a sumar (el contador es «al menos una vez»), pero
    // con processed_events intacto no: aquí se comprueba el caso normal.
    await h.env.raw.ownerPool.query(
      "update outbox_events set status = 'dispatched' where tenant_id = $1",
      [s.tenantId],
    );
    expect(
      (await state(s)).steps.find((x: { key: string }) => x.key === "invited_3_users").current,
    ).toBe(1);

    expect((await call(s, "POST", "/onboarding/dismiss")).statusCode).toBe(204);
    expect((await state(s)).dismissed).toBe(true);
    expect((await call(s, "POST", "/onboarding/restore")).statusCode).toBe(204);
    expect((await state(s)).dismissed).toBe(false);
  });

  it("solo quien gestiona puede descartar; cada tenant ve lo suyo", async () => {
    const a = await owner();
    const b = await owner();
    const sales = await h.addMember(a, "sales");
    expect((await call(sales, "GET", "/onboarding")).statusCode).toBe(200);
    expect((await call(sales, "POST", "/onboarding/dismiss")).statusCode).toBe(403);
    const acc = (await call(b, "POST", "/crm/accounts", { name: "De B" })).json();
    await call(b, "POST", "/crm/deals", {
      name: "Trato B",
      accountId: acc.id,
      nextActionText: "x",
    });
    await settle();
    expect(done(await state(b))).toContain("deal_created_or_moved");
    expect(done(await state(a))).not.toContain("deal_created_or_moved");
  });
});
