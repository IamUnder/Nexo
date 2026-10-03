import type { BatchStats } from "@nexo/contracts";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import type { Tx } from "../../../platform/db/database";
import type {
  BatchRecord,
  Entity,
  Fields,
  ImportRepository,
  ItemRecord,
  RowRecord,
  RowStatus,
} from "../application/ports";
import { batches, items, rows } from "./schema";

type BatchRow = typeof batches.$inferSelect;
type RowRow = typeof rows.$inferSelect;

const toBatch = (r: BatchRow): BatchRecord => ({
  id: r.id,
  entity: r.entity as Entity,
  filename: r.filename,
  status: r.status as BatchRecord["status"],
  onDuplicate: r.onDuplicate as "skip" | "update",
  mapping: r.mapping as Record<string, string>,
  stats: r.stats as BatchStats,
  createdByMembershipId: r.createdByMembershipId,
  createdAt: r.createdAt,
  startedAt: r.startedAt,
  finishedAt: r.finishedAt,
  rolledBackAt: r.rolledBackAt,
});

const toRow = (r: RowRow): RowRecord => ({
  rowNumber: r.rowNumber,
  raw: r.raw as Fields,
  normalized: r.normalized as Fields,
  status: r.status as RowStatus,
  action: r.action as RowRecord["action"],
  errors: r.errors as string[],
});

export class DbImportRepository implements ImportRepository {
  async insertBatch(tx: Tx, v: Parameters<ImportRepository["insertBatch"]>[1]): Promise<string> {
    const [row] = await tx
      .insert(batches)
      .values({
        tenantId: v.tenantId,
        entity: v.entity,
        filename: v.filename,
        status: v.status,
        onDuplicate: v.onDuplicate,
        mapping: v.mapping,
        stats: v.stats,
        createdByMembershipId: v.createdByMembershipId,
      })
      .returning({ id: batches.id });
    if (!row) throw new Error("No se pudo crear el lote");
    return row.id;
  }

  async insertRows(tx: Tx, tenantId: string, batchId: string, list: RowRecord[]): Promise<void> {
    if (list.length === 0) return;
    await tx.insert(rows).values(
      list.map((r) => ({
        tenantId,
        batchId,
        rowNumber: r.rowNumber,
        raw: r.raw,
        normalized: r.normalized,
        status: r.status,
        action: r.action,
        errors: r.errors,
      })),
    );
  }

  async getBatch(tx: Tx, id: string): Promise<BatchRecord | null> {
    const [row] = await tx.select().from(batches).where(eq(batches.id, id)).limit(1);
    return row ? toBatch(row) : null;
  }

  async listBatches(tx: Tx, limit: number): Promise<BatchRecord[]> {
    const list = await tx.select().from(batches).orderBy(desc(batches.createdAt)).limit(limit);
    return list.map(toBatch);
  }

  async updateBatch(tx: Tx, id: string, patch: Parameters<ImportRepository["updateBatch"]>[2]) {
    await tx.update(batches).set(patch).where(eq(batches.id, id));
  }

  async deleteBatch(tx: Tx, id: string): Promise<void> {
    await tx.delete(rows).where(eq(rows.batchId, id));
    await tx.delete(items).where(eq(items.batchId, id));
    await tx.delete(batches).where(eq(batches.id, id));
  }

  async listRows(tx: Tx, batchId: string, status: RowStatus | undefined, limit: number) {
    const list = await tx
      .select()
      .from(rows)
      .where(and(eq(rows.batchId, batchId), status ? eq(rows.status, status) : undefined))
      .orderBy(asc(rows.rowNumber))
      .limit(limit);
    return list.map(toRow);
  }

  async pendingRows(tx: Tx, batchId: string, limit: number) {
    const list = await tx
      .select()
      .from(rows)
      .where(
        and(
          eq(rows.batchId, batchId),
          inArray(rows.status, ["valid", "duplicate"]),
          or(eq(rows.action, "create"), eq(rows.action, "update")),
        ),
      )
      .orderBy(asc(rows.rowNumber))
      .limit(limit);
    return list.map(toRow);
  }

  async updateRow(
    tx: Tx,
    batchId: string,
    rowNumber: number,
    patch: Parameters<ImportRepository["updateRow"]>[3],
  ) {
    await tx
      .update(rows)
      .set(patch)
      .where(and(eq(rows.batchId, batchId), eq(rows.rowNumber, rowNumber)));
  }

  async insertItem(tx: Tx, v: Parameters<ImportRepository["insertItem"]>[1]) {
    await tx.insert(items).values(v);
  }

  async itemsOfBatch(tx: Tx, batchId: string): Promise<ItemRecord[]> {
    const list = await tx
      .select()
      .from(items)
      .where(eq(items.batchId, batchId))
      .orderBy(asc(items.createdAt), asc(items.id));
    return list.map((i) => ({
      id: i.id,
      entityType: i.entityType as Entity,
      entityId: i.entityId,
      action: i.action as "created" | "updated",
      previous: (i.previous as Record<string, null> | null) ?? null,
    }));
  }
}
