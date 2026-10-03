import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Tx } from "../../../platform/db/database";
import type { FileRecord, FileRepository, NewFile } from "../application/ports";
import { files } from "./schema";

const toRecord = (r: typeof files.$inferSelect): FileRecord => ({ ...r });

export class DbFileRepository implements FileRepository {
  async insert(tx: Tx, f: NewFile): Promise<FileRecord> {
    const [row] = await tx.insert(files).values(f).returning();
    if (!row) throw new Error("No se pudo registrar el archivo");
    return toRecord(row);
  }
  async findById(tx: Tx, id: string): Promise<FileRecord | null> {
    const [row] = await tx.select().from(files).where(eq(files.id, id)).limit(1);
    return row ? toRecord(row) : null;
  }
  async list(
    tx: Tx,
    filter: {
      ownerModule?: string | undefined;
      entityType?: string | undefined;
      entityId?: string | undefined;
    },
  ) {
    const rows = await tx
      .select()
      .from(files)
      .where(
        and(
          filter.ownerModule ? eq(files.ownerModule, filter.ownerModule) : undefined,
          filter.entityType ? eq(files.entityType, filter.entityType) : undefined,
          filter.entityId ? eq(files.entityId, filter.entityId) : undefined,
        ),
      )
      .orderBy(desc(files.createdAt))
      .limit(200);
    return rows.map(toRecord);
  }
  async markReady(tx: Tx, id: string, sizeBytes: number): Promise<FileRecord> {
    const [row] = await tx
      .update(files)
      .set({ status: "ready", sizeBytes, updatedAt: new Date() })
      .where(eq(files.id, id))
      .returning();
    if (!row) throw new Error("Archivo no encontrado");
    return toRecord(row);
  }
  async markDeleted(tx: Tx, id: string): Promise<void> {
    await tx
      .update(files)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(files.id, id));
  }
  async usedBytes(tx: Tx): Promise<number> {
    const [r] = await tx
      .select({ total: sql<string>`coalesce(sum(${files.sizeBytes}), 0)` })
      .from(files)
      .where(inArray(files.status, ["pending", "ready"]));
    return Number(r?.total ?? 0);
  }
}
