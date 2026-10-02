import { sql } from "drizzle-orm";
import { bigint, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { tenants } from "../../../platform/db/schema";

/**
 * Metadatos de archivos (MODULES_SPEC §2.5). El contenido vive en el almacenamiento S3-compatible
 * bajo `t/<tenantId>/<módulo>/…`; la clave la construye SIEMPRE el servidor.
 */
export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    ownerModule: text("owner_module").notNull(),
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    storageKey: text("storage_key").notNull().unique(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    sha256: text("sha256"),
    /** pending (URL emitida) → ready (subida confirmada) → deleted. */
    status: text("status").notNull().default("pending"),
    uploadedBy: uuid("uploaded_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("files_tenant_id_id_uq").on(t.tenantId, t.id),
    index("files_tenant_owner_idx").on(t.tenantId, t.ownerModule, t.entityType, t.entityId),
    index("files_tenant_status_idx").on(t.tenantId, t.status),
  ],
);
