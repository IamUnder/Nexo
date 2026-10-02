import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Database } from "../db/database";
import { defineTenantJob } from "./defineTenantJob";

const TENANT = "0190f8a0-7c1b-7d2e-8a3b-1c2d3e4f5a6b";

function fakeDatabase() {
  const withTenant = vi.fn(async (_ctx: unknown, fn: (tx: unknown) => Promise<unknown>) => fn({}));
  return { database: { withTenant } as unknown as Database, withTenant };
}

const job = defineTenantJob({
  name: "test.job",
  payloadSchema: z.object({ tenantId: z.string(), n: z.number() }),
  run: vi.fn(async () => undefined),
});

describe("defineTenantJob", () => {
  it("ejecuta el job dentro de withTenant con el tenant del payload", async () => {
    const { database, withTenant } = fakeDatabase();
    await job.handle(database, { tenantId: TENANT, n: 1 });
    expect(withTenant).toHaveBeenCalledOnce();
    expect(withTenant.mock.calls[0]?.[0]).toMatchObject({ tenantId: TENANT });
  });

  it("rechaza payloads sin tenantId o con tenantId que no es UUID", async () => {
    const { database, withTenant } = fakeDatabase();
    await expect(job.handle(database, { n: 1 })).rejects.toThrow();
    await expect(job.handle(database, { tenantId: "no-uuid", n: 1 })).rejects.toThrow();
    expect(withTenant).not.toHaveBeenCalled();
  });

  it("valida el resto del payload", async () => {
    const { database } = fakeDatabase();
    await expect(job.handle(database, { tenantId: TENANT, n: "x" })).rejects.toThrow();
  });
});
