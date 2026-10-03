import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHarness, type Harness, type Session } from "../../testing/harness";

/** Importación de extremo a extremo con PostgreSQL real: simulación fiel, dedupe, ejecución, rollback, export. */
let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h?.stop();
});

const api = (s: Session, method: "GET" | "POST" | "DELETE", url: string, payload?: object) =>
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

const companyMapping = { name: "Empresa", taxId: "CIF", website: "Web", phone: "Teléfono" };
const companyRows = [
  {
    Empresa: "Acme Industrial S.L.",
    CIF: "b-12345678",
    Web: "www.acme.es",
    Teléfono: "+34 600 111 222",
  },
  { Empresa: "Ñandú Software", CIF: "", Web: "", Teléfono: "" },
  { Empresa: "", CIF: "B99999999", Web: "", Teléfono: "" }, // inválida: sin nombre
  { Empresa: "acme industrial s.l.", CIF: "B12345678", Web: "", Teléfono: "" }, // repetida en el fichero
];

async function batch(s: Session, payload: object) {
  const r = await api(s, "POST", "/import/batches", payload);
  expect(r.statusCode, r.body).toBe(201);
  return r.json() as {
    id: string;
    status: string;
    stats: Record<string, number>;
    canRollback: boolean;
  };
}
async function run(s: Session, id: string) {
  const r = await api(s, "POST", `/import/batches/${id}/execute`);
  expect(r.statusCode, r.body).toBe(202);
  await h.services.dataImport.service.settle();
  return (await api(s, "GET", `/import/batches/${id}`)).json() as {
    status: string;
    stats: Record<string, number>;
    canRollback: boolean;
  };
}
const listAccounts = async (s: Session) =>
  (await api(s, "GET", "/crm/accounts?limit=100")).json().items as Array<{
    name: string;
    taxId: string | null;
    domain: string | null;
    phone: string | null;
    source: string | null;
  }>;

describe("simulación (dry run)", () => {
  it("valida, deduplica dentro del fichero y no escribe nada en el CRM", async () => {
    const s = await owner();
    const b = await batch(s, {
      entity: "companies",
      filename: "empresas.csv",
      mapping: companyMapping,
      rows: companyRows,
    });
    expect(b.status).toBe("simulated");
    expect(b.stats).toMatchObject({
      total: 4,
      valid: 2,
      invalid: 1,
      duplicates: 1,
      toCreate: 2,
      toUpdate: 0,
      skipped: 1,
      created: 0,
    });
    expect(await listAccounts(s)).toHaveLength(0); // simulación fiel: nada escrito

    const rows = (await api(s, "GET", `/import/batches/${b.id}/rows`)).json() as Array<{
      rowNumber: number;
      status: string;
      errors: string[];
      label: string;
    }>;
    expect(rows.map((r) => r.status)).toEqual(["valid", "valid", "invalid", "duplicate"]);
    expect(rows[2]?.errors[0]).toMatch(/obligatorio/);
    expect(rows[3]?.errors[0]).toMatch(/Repetida en el fichero/);
    const invalid = (await api(s, "GET", `/import/batches/${b.id}/rows?status=invalid`)).json();
    expect(invalid).toHaveLength(1);
  });

  it("rechaza un mapeo inválido (falta el campo obligatorio, columna inexistente, campo desconocido)", async () => {
    const s = await owner();
    const post = (mapping: object) =>
      api(s, "POST", "/import/batches", {
        entity: "companies",
        filename: "x.csv",
        mapping,
        rows: companyRows,
      });
    for (const mapping of [
      { taxId: "CIF" },
      { name: "NoExiste" },
      { name: "Empresa", color: "CIF" },
    ]) {
      const r = await post(mapping);
      expect(r.statusCode).toBe(400);
      expect(r.json().error.code).toBe("import.mapping_invalid");
    }
  });

  it("descartar un lote sin ejecutar lo elimina; uno ejecutado no se puede descartar", async () => {
    const s = await owner();
    const b = await batch(s, {
      entity: "companies",
      filename: "a.csv",
      mapping: companyMapping,
      rows: companyRows,
    });
    expect((await api(s, "DELETE", `/import/batches/${b.id}`)).statusCode).toBe(204);
    expect((await api(s, "GET", `/import/batches/${b.id}`)).statusCode).toBe(404);
    const b2 = await batch(s, {
      entity: "companies",
      filename: "b.csv",
      mapping: companyMapping,
      rows: companyRows,
    });
    await run(s, b2.id);
    const del = await api(s, "DELETE", `/import/batches/${b2.id}`);
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe("import.batch_invalid_state");
  });
});

describe("ejecución", () => {
  it("importa solo lo válido, normaliza los datos, marca el origen y deja traza", async () => {
    const s = await owner();
    const b = await batch(s, {
      entity: "companies",
      filename: "e.csv",
      mapping: companyMapping,
      rows: companyRows,
    });
    const done = await run(s, b.id);
    expect(done.status).toBe("completed");
    expect(done.stats).toMatchObject({ created: 2, updated: 0, failed: 0 });
    expect(done.canRollback).toBe(true);

    const accounts = await listAccounts(s);
    expect(accounts.map((a) => a.name).sort()).toEqual(["Acme Industrial S.L.", "Ñandú Software"]);
    const acme = accounts.find((a) => a.name.startsWith("Acme"));
    expect(acme).toMatchObject({
      taxId: "B12345678",
      domain: "acme.es",
      phone: "+34600111222",
      source: "import",
    });

    // Eventos de dominio del CRM con origen import + evento del lote + auditoría.
    const events = await h.events(s.tenantId, "crm.account.created");
    expect(events).toHaveLength(2);
    const [batchEvent] = await h.events(s.tenantId, "import.batch.completed");
    expect(batchEvent?.payload).toMatchObject({ batchId: b.id, created: 2 });
    const audit = await h.env.raw.ownerPool.query(
      "select action from audit_log where tenant_id = $1 and action like 'import.%' order by occurred_at",
      [s.tenantId],
    );
    expect(audit.rows.map((r) => r.action)).toEqual([
      "import.batch_started",
      "import.batch_completed",
    ]);
    // No se puede ejecutar dos veces.
    const again = await api(s, "POST", `/import/batches/${b.id}/execute`);
    expect(again.statusCode).toBe(409);
  });

  it("duplicados con el CRM: «omitir» no toca nada; «actualizar» solo rellena huecos y no pisa datos", async () => {
    const s = await owner();
    await api(s, "POST", "/crm/accounts", {
      name: "Acme Industrial S.L.",
      taxId: "B12345678",
      phone: "999 000 000",
    });

    const skip = await batch(s, {
      entity: "companies",
      filename: "s.csv",
      onDuplicate: "skip",
      mapping: companyMapping,
      rows: [companyRows[0]],
    });
    expect(skip.stats).toMatchObject({ duplicates: 1, toCreate: 0, skipped: 1 });
    const skipDone = await run(s, skip.id);
    expect(skipDone.stats).toMatchObject({ created: 0, updated: 0 });
    expect(await listAccounts(s)).toHaveLength(1);

    const upd = await batch(s, {
      entity: "companies",
      filename: "u.csv",
      onDuplicate: "update",
      mapping: companyMapping,
      rows: [companyRows[0]],
    });
    expect(upd.stats).toMatchObject({ duplicates: 1, toUpdate: 1 });
    const updDone = await run(s, upd.id);
    expect(updDone.stats).toMatchObject({ created: 0, updated: 1 });
    const [acme] = await listAccounts(s);
    // El teléfono que ya tenía el usuario se conserva; el dominio (vacío) se rellena desde la web.
    expect(acme).toMatchObject({ phone: "999 000 000", domain: "acme.es" });
  });

  it("contactos: nombre completo, email normalizado, vínculo a empresa existente y duplicados por email", async () => {
    const s = await owner();
    await api(s, "POST", "/crm/accounts", { name: "Acme Industrial S.L." });
    await api(s, "POST", "/crm/contacts", { firstName: "Eva", email: "eva@acme.es" });
    const rows = [
      {
        Nombre: "Luis Pérez Gil",
        Email: " LUIS@ACME.ES ",
        Empresa: "ACME industrial s.l.",
        Cargo: "CTO",
      },
      { Nombre: "Eva Ruiz", Email: "eva@acme.es", Empresa: "", Cargo: "" }, // ya existe
      { Nombre: "Sin Email", Email: "", Empresa: "Empresa Fantasma", Cargo: "" },
      { Nombre: "Roto", Email: "roto@", Empresa: "", Cargo: "" },
    ];
    const mapping = {
      fullName: "Nombre",
      email: "Email",
      companyName: "Empresa",
      jobTitle: "Cargo",
    };
    const b = await batch(s, { entity: "contacts", filename: "c.csv", mapping, rows });
    expect(b.stats).toMatchObject({
      total: 4,
      valid: 2,
      invalid: 1,
      duplicates: 1,
      toCreate: 2,
      skipped: 1,
    });
    const warn = (await api(s, "GET", `/import/batches/${b.id}/rows`)).json() as Array<{
      errors: string[];
    }>;
    expect(warn[2]?.errors[0]).toMatch(/Empresa «Empresa Fantasma» no encontrada/);

    const done = await run(s, b.id);
    expect(done.stats).toMatchObject({ created: 2, failed: 0 });
    const contacts = (await api(s, "GET", "/crm/contacts?limit=100")).json().items as Array<{
      fullName: string;
      email: string | null;
      accountName: string | null;
      jobTitle: string | null;
    }>;
    const luis = contacts.find((c) => c.fullName === "Luis Pérez Gil");
    expect(luis).toMatchObject({
      email: "luis@acme.es",
      accountName: "Acme Industrial S.L.",
      jobTitle: "CTO",
    });
    expect(contacts.find((c) => c.fullName === "Sin Email")?.accountName).toBeNull();
  });
});

describe("rollback", () => {
  it("deshace lo creado y restaura lo actualizado; el lote queda como deshecho", async () => {
    const s = await owner();
    await api(s, "POST", "/crm/accounts", { name: "Acme Industrial S.L.", taxId: "B12345678" });
    const b = await batch(s, {
      entity: "companies",
      filename: "r.csv",
      onDuplicate: "update",
      mapping: companyMapping,
      rows: companyRows.slice(0, 2),
    });
    expect((await run(s, b.id)).stats).toMatchObject({ created: 1, updated: 1 });
    expect((await listAccounts(s)).map((a) => a.name).sort()).toEqual([
      "Acme Industrial S.L.",
      "Ñandú Software",
    ]);

    const rb = await api(s, "POST", `/import/batches/${b.id}/rollback`);
    expect(rb.statusCode, rb.body).toBe(200);
    expect(rb.json()).toMatchObject({
      kept: 0,
      batch: { status: "rolled_back", canRollback: false },
    });
    const after = await listAccounts(s);
    expect(after.map((a) => a.name)).toEqual(["Acme Industrial S.L."]);
    expect(after[0]).toMatchObject({ domain: null, phone: null, taxId: "B12345678" }); // lo añadido se quitó
    expect(await h.events(s.tenantId, "import.batch.rolled_back")).toHaveLength(1);
    // No se puede deshacer dos veces ni un lote sin completar.
    expect((await api(s, "POST", `/import/batches/${b.id}/rollback`)).statusCode).toBe(409);
  });

  it("respeta la ventana de 30 días y avisa de lo que el usuario ya cambió", async () => {
    const s = await owner();
    const b = await batch(s, {
      entity: "companies",
      filename: "w.csv",
      mapping: companyMapping,
      rows: companyRows.slice(1, 2),
    });
    await run(s, b.id);
    // El usuario le cuelga una oportunidad abierta a la empresa importada: no se puede borrar.
    const [acc] = await listAccounts(s);
    const accounts = (await api(s, "GET", "/crm/accounts")).json().items as Array<{ id: string }>;
    await api(s, "POST", "/crm/deals", {
      name: "Trato",
      accountId: accounts[0]?.id,
      nextActionText: "x",
    });
    const rb = await api(s, "POST", `/import/batches/${b.id}/rollback`);
    expect(rb.json().kept).toBe(1);
    expect(await listAccounts(s)).toHaveLength(1);
    expect(acc?.name).toBe("Ñandú Software");

    // Fuera de ventana (31 días) → no se puede deshacer.
    const b2 = await batch(s, {
      entity: "companies",
      filename: "w2.csv",
      mapping: companyMapping,
      rows: [{ Empresa: "Otra SL", CIF: "", Web: "", Teléfono: "" }],
    });
    await run(s, b2.id);
    await h.env.raw.ownerPool.query("update import_batches set finished_at = $2 where id = $1", [
      b2.id,
      new Date(h.clock.now().getTime() - 31 * 86_400_000),
    ]);
    const late = await api(s, "POST", `/import/batches/${b2.id}/rollback`);
    expect(late.statusCode).toBe(409);
  });
});

describe("exportación y permisos", () => {
  it("exporta las empresas en CSV para Excel (; + BOM) con lo creado", async () => {
    const s = await owner();
    await api(s, "POST", "/crm/accounts", { name: "Con;punto y coma", taxId: "B1" });
    const r = await api(s, "GET", "/import/export/companies");
    expect(r.statusCode).toBe(200);
    expect(r.headers["content-type"]).toContain("text/csv");
    expect(r.headers["content-disposition"]).toContain("nexo-companies.csv");
    expect(r.body.startsWith("﻿name;legalName;taxId")).toBe(true);
    expect(r.body).toContain('"Con;punto y coma";;B1');
    const c = await api(s, "GET", "/import/export/contacts");
    expect(c.statusCode).toBe(200);
  });

  it("solo manager/admin importan; un comercial no", async () => {
    const o = await owner();
    const sales = await h.addMember(o, "sales");
    const manager = await h.addMember(o, "manager");
    expect((await api(sales, "GET", "/import/batches")).statusCode).toBe(403);
    expect(
      (
        await api(sales, "POST", "/import/batches", {
          entity: "companies",
          filename: "x",
          mapping: companyMapping,
          rows: companyRows,
        })
      ).statusCode,
    ).toBe(403);
    expect((await api(sales, "GET", "/import/export/companies")).statusCode).toBe(403);
    expect((await api(manager, "GET", "/import/batches")).statusCode).toBe(200);
  });

  it("aislamiento: un tenant no ve ni ejecuta lotes de otro", async () => {
    const a = await owner();
    const b = await owner();
    const batchB = await batch(b, {
      entity: "companies",
      filename: "b.csv",
      mapping: companyMapping,
      rows: companyRows,
    });
    expect((await api(a, "GET", `/import/batches/${batchB.id}`)).statusCode).toBe(404);
    expect((await api(a, "GET", `/import/batches/${batchB.id}/rows`)).statusCode).toBe(404);
    expect((await api(a, "POST", `/import/batches/${batchB.id}/execute`)).statusCode).toBe(404);
    expect((await api(a, "DELETE", `/import/batches/${batchB.id}`)).statusCode).toBe(404);
    expect((await api(a, "GET", "/import/batches")).json()).toHaveLength(0);
  });
});

describe("rollback de un lote solo de altas", () => {
  it("quita todas las empresas creadas", async () => {
    const s = await owner();
    const b = await batch(s, {
      entity: "companies",
      filename: "d.csv",
      mapping: companyMapping,
      rows: companyRows.slice(0, 2),
    });
    expect((await run(s, b.id)).stats).toMatchObject({ created: 2 });
    const rb = await api(s, "POST", `/import/batches/${b.id}/rollback`);
    expect(rb.json()).toMatchObject({ kept: 0 });
    expect(await listAccounts(s)).toHaveLength(0);
  });
});
