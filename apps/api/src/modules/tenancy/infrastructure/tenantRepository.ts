import { and, asc, eq, gt, ilike, sql } from "drizzle-orm";
import type { Tx } from "../../../platform/db/database";
import { tenants } from "../../../platform/db/schema";
import type {
  NewTenant,
  TenantListQuery,
  TenantRecord,
  TenantRepository,
} from "../application/ports";
import { tenantSettings } from "./schema";

type Row = typeof tenants.$inferSelect;

function toRecord(r: Row): TenantRecord {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    status: r.status,
    trialEndsAt: r.trialEndsAt,
    origin: r.origin,
    isDemo: r.isDemo,
    locale: r.locale,
    timezone: r.timezone,
    currency: r.currency,
    country: r.country,
    flags: (r.flags ?? {}) as Record<string, unknown>,
    createdAt: r.createdAt,
  };
}

/** Escapa `%` y `_` de un término de búsqueda para usarlo en ILIKE de forma literal. */
function likeEscape(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class DbTenantRepository implements TenantRepository {
  async slugExists(tx: Tx, slug: string): Promise<boolean> {
    const rows = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);
    return rows.length > 0;
  }

  async insert(tx: Tx, v: NewTenant): Promise<TenantRecord> {
    const [row] = await tx
      .insert(tenants)
      .values({
        slug: v.slug,
        name: v.name,
        status: v.status,
        trialEndsAt: v.trialEndsAt,
        origin: v.origin,
        country: v.country,
      })
      .returning();
    if (!row) throw new Error("No se pudo crear el tenant");
    return toRecord(row);
  }

  async findById(tx: Tx, id: string): Promise<TenantRecord | null> {
    const [row] = await tx.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }

  async list(tx: Tx, q: TenantListQuery) {
    // Paginación por cursor sobre el id (UUIDv7 → orden temporal estable).
    const rows = await tx
      .select()
      .from(tenants)
      .where(
        and(
          q.cursor ? gt(tenants.id, q.cursor) : undefined,
          q.status ? eq(tenants.status, q.status) : undefined,
          q.search
            ? sql`(${ilike(tenants.name, `%${likeEscape(q.search)}%`)} or ${ilike(tenants.slug, `%${likeEscape(q.search)}%`)})`
            : undefined,
        ),
      )
      .orderBy(asc(tenants.id))
      .limit(q.limit + 1);
    const items = rows.slice(0, q.limit).map(toRecord);
    const last = items.at(-1);
    return { items, nextCursor: rows.length > q.limit && last ? last.id : null };
  }

  async update(
    tx: Tx,
    id: string,
    patch: Partial<
      Pick<
        TenantRecord,
        "name" | "status" | "trialEndsAt" | "locale" | "timezone" | "currency" | "flags"
      >
    >,
  ): Promise<TenantRecord> {
    const [row] = await tx
      .update(tenants)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    if (!row) throw new Error("Tenant no encontrado");
    return toRecord(row);
  }

  async getSettings(tx: Tx, tenantId: string): Promise<Record<string, unknown>> {
    const rows = await tx
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId));
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async putSetting(tx: Tx, tenantId: string, key: string, value: unknown): Promise<void> {
    await tx
      .insert(tenantSettings)
      .values({ tenantId, key, value })
      .onConflictDoUpdate({
        target: [tenantSettings.tenantId, tenantSettings.key],
        set: { value, updatedAt: new Date() },
      });
  }
}
