import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureDemoTenant, loadDemoData, openDemoRuntime } from "../../scripts/lib/demo";
import { createHarness, type Harness } from "./harness";

/** Tenant demo: alta idempotente, activo para siempre, carga y reseteo de datos de ejemplo. */
let h: Harness;
beforeAll(async () => {
  h = await createHarness();
  process.env.DATABASE_URL_APP = h.env.raw.appUrl;
  process.env.DATABASE_URL_PLATFORM = h.env.raw.platformUrl;
  process.env.JWT_SIGNING_KEYS = "k1:0123456789abcdef0123456789abcdef0123";
  process.env.DEMO_ADMIN_EMAIL = "demo@example.com";
  process.env.DEMO_ADMIN_PASSWORD = "caballo bateria grapa correcta";
});
afterAll(async () => {
  await h?.stop();
});

describe("tenant demo", () => {
  it("se crea una sola vez, queda activo sin caducidad y el reseteo repone los datos", async () => {
    const rt = openDemoRuntime();
    try {
      const ctx = await ensureDemoTenant(rt);
      const again = await ensureDemoTenant(rt);
      expect(again.tenantId).toBe(ctx.tenantId);

      const t = await h.env.raw.ownerPool.query(
        "select status, trial_ends_at from tenants where id = $1",
        [ctx.tenantId],
      );
      expect(t.rows[0]).toMatchObject({ status: "active", trial_ends_at: null });
      const count = await h.env.raw.ownerPool.query(
        "select count(*)::int as n from tenants where name = 'Nexo Demo'",
      );
      expect(count.rows[0].n).toBe(1);

      expect(await loadDemoData(rt, ctx, false)).toMatchObject({ accounts: 8, deals: 10 });
      // Sin reset, volver a ejecutarlo repone sin duplicar.
      expect(await loadDemoData(rt, ctx, false)).toMatchObject({ accounts: 8, deals: 10 });
      const deals = await h.env.raw.ownerPool.query(
        "select count(*)::int as n from crm_deals where tenant_id = $1 and deleted_at is null",
        [ctx.tenantId],
      );
      expect(deals.rows[0].n).toBe(10);

      // Un dato propio del demo no se toca al resetear.
      await rt.services.crm.services.accounts.create(
        ctx,
        { scope: "all" },
        { name: "Cuenta real del demo", status: "prospect" },
      );
      await loadDemoData(rt, ctx, true);
      const names = await h.env.raw.ownerPool.query(
        "select name from crm_accounts where tenant_id = $1 and deleted_at is null and source is distinct from 'sample'",
        [ctx.tenantId],
      );
      expect(names.rows.map((r) => r.name)).toEqual(["Cuenta real del demo"]);
    } finally {
      await rt.close();
    }
  });
});
