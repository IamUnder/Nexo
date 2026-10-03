import type { BatchStats } from "@nexo/contracts";
import type { Tx } from "../../../platform/db/database";
import type { TenantContext } from "../../../platform/tenant/context";

export type Entity = "companies" | "contacts";
export type Fields = Record<string, string>;

/**
 * Puerto `ImportTarget` (MODULES_SPEC §6.4): lo que el módulo necesita del CRM, sin importarlo.
 * El adaptador del CRM se conecta en `composition/`.
 */
export interface ImportTarget {
  lookup(
    ctx: TenantContext,
    entity: Entity,
    f: Fields,
  ): Promise<{ id: string; label: string } | null>;
  resolveCompany(ctx: TenantContext, name: string): Promise<string | null>;
  create(ctx: TenantContext, entity: Entity, f: Fields): Promise<string>;
  fillEmpty(
    ctx: TenantContext,
    entity: Entity,
    id: string,
    f: Fields,
  ): Promise<{ previous: Record<string, null>; changed: boolean }>;
  revertFill(
    ctx: TenantContext,
    entity: Entity,
    id: string,
    previous: Record<string, null>,
  ): Promise<void>;
  remove(ctx: TenantContext, entity: Entity, id: string): Promise<void>;
  exportPage(
    ctx: TenantContext,
    entity: Entity,
    cursor: string | undefined,
  ): Promise<{ rows: Fields[]; nextCursor: string | null }>;
}

export type BatchStatus = "simulated" | "running" | "completed" | "failed" | "rolled_back";
export type RowStatus = "valid" | "invalid" | "duplicate" | "imported" | "skipped";
export type RowAction = "create" | "update" | "none";

export interface BatchRecord {
  id: string;
  entity: Entity;
  filename: string;
  status: BatchStatus;
  onDuplicate: "skip" | "update";
  mapping: Record<string, string>;
  stats: BatchStats;
  createdByMembershipId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  rolledBackAt: Date | null;
}

export interface RowRecord {
  rowNumber: number;
  raw: Fields;
  normalized: Fields;
  status: RowStatus;
  action: RowAction;
  errors: string[];
}

export interface ItemRecord {
  id: string;
  entityType: Entity;
  entityId: string;
  action: "created" | "updated";
  previous: Record<string, null> | null;
}

/** Persistencia del módulo (la implementa `infrastructure/`). */
export interface ImportRepository {
  insertBatch(
    tx: Tx,
    v: {
      tenantId: string;
      entity: Entity;
      filename: string;
      status: BatchStatus;
      onDuplicate: "skip" | "update";
      mapping: Record<string, string>;
      stats: BatchStats;
      createdByMembershipId: string | null;
    },
  ): Promise<string>;
  insertRows(tx: Tx, tenantId: string, batchId: string, rows: RowRecord[]): Promise<void>;
  getBatch(tx: Tx, id: string): Promise<BatchRecord | null>;
  listBatches(tx: Tx, limit: number): Promise<BatchRecord[]>;
  updateBatch(
    tx: Tx,
    id: string,
    patch: Partial<
      Pick<BatchRecord, "status" | "stats" | "startedAt" | "finishedAt" | "rolledBackAt">
    >,
  ): Promise<void>;
  deleteBatch(tx: Tx, id: string): Promise<void>;
  listRows(
    tx: Tx,
    batchId: string,
    status: RowStatus | undefined,
    limit: number,
  ): Promise<RowRecord[]>;
  /** Filas pendientes de ejecutar (válidas o duplicadas a actualizar), en orden. */
  pendingRows(tx: Tx, batchId: string, limit: number): Promise<RowRecord[]>;
  updateRow(
    tx: Tx,
    batchId: string,
    rowNumber: number,
    patch: Partial<Pick<RowRecord, "status" | "action" | "errors">>,
  ): Promise<void>;
  insertItem(
    tx: Tx,
    v: {
      tenantId: string;
      batchId: string;
      entityType: Entity;
      entityId: string;
      action: "created" | "updated";
      previous: Record<string, null> | null;
    },
  ): Promise<void>;
  itemsOfBatch(tx: Tx, batchId: string): Promise<ItemRecord[]>;
}
