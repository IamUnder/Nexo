import type { Tx } from "../../../platform/db/database";

export interface FileRecord {
  id: string;
  tenantId: string;
  ownerModule: string;
  entityType: string | null;
  entityId: string | null;
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number | null;
  status: string;
  uploadedBy: string | null;
  createdAt: Date;
}

export interface NewFile {
  id: string;
  tenantId: string;
  ownerModule: string;
  entityType: string | null;
  entityId: string | null;
  storageKey: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string | null;
}

/** Persistencia de metadatos de archivos (todo bajo `withTenant`: RLS por tenant). */
export interface FileRepository {
  insert(tx: Tx, f: NewFile): Promise<FileRecord>;
  findById(tx: Tx, id: string): Promise<FileRecord | null>;
  list(
    tx: Tx,
    filter: {
      ownerModule?: string | undefined;
      entityType?: string | undefined;
      entityId?: string | undefined;
    },
  ): Promise<FileRecord[]>;
  markReady(tx: Tx, id: string, sizeBytes: number): Promise<FileRecord>;
  markDeleted(tx: Tx, id: string): Promise<void>;
  /** Bytes en uso por el tenant (archivos `pending` + `ready`). */
  usedBytes(tx: Tx): Promise<number>;
}

/** Límite de almacenamiento del tenant en bytes (hito 2: entitlements). `null` = sin límite. */
export interface StorageLimit {
  limitBytes(tx: Tx, tenantId: string): Promise<number | null>;
}
