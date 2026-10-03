import {
  type BatchDto,
  type BatchRowDto,
  type BatchStats,
  type CreateBatchInput,
  EVENT_TYPES,
  importBatchEventV1,
  MAX_IMPORT_ROWS,
} from "@nexo/contracts";
import type { Database } from "../../../platform/db/database";
import { AppError, NotFoundError } from "../../../platform/errors";
import { publishEvent } from "../../../platform/events/outbox";
import { uuidv7 } from "../../../platform/ids";
import type { Logger } from "../../../platform/logger";
import type { AuditLogger, Clock } from "../../../platform/ports";
import type { TenantContext } from "../../../platform/tenant/context";
import {
  applyMapping,
  identityKey,
  normalizeCompany,
  normalizeContact,
  rowLabel,
  toCsv,
  validateMapping,
} from "../domain/normalize";
import type {
  BatchRecord,
  Entity,
  Fields,
  ImportRepository,
  ImportTarget,
  RowRecord,
  RowStatus,
} from "./ports";

const ROLLBACK_WINDOW_MS = 30 * 86_400_000;
/** Un lote «en ejecución» sin avances durante este tiempo se considera huérfano (el proceso cayó) y se reanuda. */
const STALE_RUN_MS = 10 * 60_000;
const PAGE = 100;

const zeroStats = (total: number): BatchStats => ({
  total,
  valid: 0,
  invalid: 0,
  duplicates: 0,
  toCreate: 0,
  toUpdate: 0,
  skipped: 0,
  created: 0,
  updated: 0,
  failed: 0,
});

const notFound = () => new NotFoundError("lote de importación");
const invalidState = (message: string) => new AppError("import.batch_invalid_state", 409, message);

/** El actor de las escrituras de una importación es el usuario, pero con origen `import` (trazabilidad). */
const importCtx = (ctx: TenantContext): TenantContext => ({
  ...ctx,
  actor: { membershipId: ctx.actor.membershipId, source: "import" },
});

export class ImportService {
  /** Ejecuciones en curso en este proceso (para esperar en tests y al apagar). */
  private readonly inflight = new Map<string, Promise<void>>();

  constructor(
    private readonly d: {
      database: Database;
      repo: ImportRepository;
      target: ImportTarget;
      audit: AuditLogger;
      clock: Clock;
      logger: Logger;
    },
  ) {}

  // ── Consulta ────────────────────────────────────────────────────────────────────────────────
  toDto(b: BatchRecord): BatchDto {
    const now = this.d.clock.now().getTime();
    return {
      id: b.id,
      entity: b.entity,
      filename: b.filename,
      status: b.status,
      onDuplicate: b.onDuplicate,
      stats: b.stats,
      createdAt: b.createdAt.toISOString(),
      startedAt: b.startedAt ? b.startedAt.toISOString() : null,
      finishedAt: b.finishedAt ? b.finishedAt.toISOString() : null,
      canRollback:
        b.status === "completed" &&
        b.stats.created + b.stats.updated > 0 &&
        b.finishedAt !== null &&
        now - b.finishedAt.getTime() < ROLLBACK_WINDOW_MS,
    };
  }

  async list(ctx: TenantContext): Promise<BatchDto[]> {
    const rows = await this.d.database.withTenant(ctx, (tx) => this.d.repo.listBatches(tx, 50));
    return rows.map((b) => this.toDto(b));
  }

  async get(ctx: TenantContext, id: string): Promise<BatchDto> {
    const b = await this.d.database.withTenant(ctx, (tx) => this.d.repo.getBatch(tx, id));
    if (!b) throw notFound();
    return this.toDto(b);
  }

  async rows(
    ctx: TenantContext,
    id: string,
    status: RowStatus | undefined,
    limit: number,
  ): Promise<BatchRowDto[]> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const b = await this.d.repo.getBatch(tx, id);
      if (!b) throw notFound();
      const rows = await this.d.repo.listRows(tx, id, status, limit);
      return rows.map((r) => ({
        rowNumber: r.rowNumber,
        status: r.status,
        action: r.action,
        errors: r.errors,
        raw: r.raw,
        label: rowLabel(b.entity, r.normalized, r.raw),
      }));
    });
  }

  // ── Simulación (dry run): valida, deduplica y planifica sin escribir en el CRM ────────────────
  async createBatch(ctx: TenantContext, input: CreateBatchInput): Promise<BatchDto> {
    if (input.rows.length > MAX_IMPORT_ROWS) {
      throw new AppError("import.too_many_rows", 400, "Demasiadas filas", { max: MAX_IMPORT_ROWS });
    }
    const columns = new Set(input.rows.slice(0, 50).flatMap((r) => Object.keys(r)));
    const problem = validateMapping(input.entity, input.mapping, columns);
    if (problem)
      throw new AppError("import.mapping_invalid", 400, `Mapeo no válido: ${problem}`, { problem });

    const stats = zeroStats(input.rows.length);
    const seen = new Set<string>();
    const records: RowRecord[] = [];
    // El CRM se consulta con el contexto de importación (solo lectura aquí).
    const lookupCtx = importCtx(ctx);

    for (const [index, raw] of input.rows.entries()) {
      const mapped = applyMapping(input.mapping, raw);
      const { fields, errors } =
        input.entity === "companies" ? normalizeCompany(mapped) : normalizeContact(mapped);
      const rec: RowRecord = {
        rowNumber: index + 1,
        raw,
        normalized: fields,
        status: "valid",
        action: "create",
        errors,
      };
      if (errors.length > 0) {
        rec.status = "invalid";
        rec.action = "none";
        stats.invalid++;
      } else {
        const key = identityKey(input.entity, fields);
        if (key && seen.has(key)) {
          rec.status = "duplicate";
          rec.action = "none";
          rec.errors = ["Repetida en el fichero: ya aparece en una fila anterior"];
          stats.duplicates++;
          stats.skipped++;
        } else {
          if (key) seen.add(key);
          const existing = await this.d.target.lookup(lookupCtx, input.entity, fields);
          if (existing) {
            rec.status = "duplicate";
            rec.action = input.onDuplicate === "update" ? "update" : "none";
            rec.errors = [`Ya existe: ${existing.label}`];
            stats.duplicates++;
            if (rec.action === "update") stats.toUpdate++;
            else stats.skipped++;
          } else {
            stats.valid++;
            stats.toCreate++;
            if (input.entity === "contacts" && fields.companyName) {
              const company = await this.d.target.resolveCompany(lookupCtx, fields.companyName);
              if (!company) {
                rec.errors = [
                  `Empresa «${fields.companyName}» no encontrada: se importará sin empresa`,
                ];
              }
            }
          }
        }
      }
      records.push(rec);
    }

    return this.d.database.withTenant(ctx, async (tx) => {
      const id = await this.d.repo.insertBatch(tx, {
        tenantId: ctx.tenantId,
        entity: input.entity,
        filename: input.filename,
        status: "simulated",
        onDuplicate: input.onDuplicate,
        mapping: input.mapping,
        stats,
        createdByMembershipId: ctx.actor.membershipId,
      });
      for (let i = 0; i < records.length; i += 500) {
        await this.d.repo.insertRows(tx, ctx.tenantId, id, records.slice(i, i + 500));
      }
      const batch = await this.d.repo.getBatch(tx, id);
      if (!batch) throw notFound();
      return this.toDto(batch);
    });
  }

  async discard(ctx: TenantContext, id: string): Promise<void> {
    await this.d.database.withTenant(ctx, async (tx) => {
      const b = await this.d.repo.getBatch(tx, id);
      if (!b) throw notFound();
      if (b.status !== "simulated")
        throw invalidState("Solo se puede descartar un lote sin ejecutar");
      await this.d.repo.deleteBatch(tx, id);
    });
  }

  // ── Ejecución asíncrona con checkpoint por fila (reanudable) ──────────────────────────────────
  async execute(ctx: TenantContext, id: string): Promise<BatchDto> {
    const batch = await this.d.database.withTenant(ctx, async (tx) => {
      const b = await this.d.repo.getBatch(tx, id);
      if (!b) throw notFound();
      const now = this.d.clock.now();
      const stale =
        b.status === "running" &&
        !this.inflight.has(id) &&
        (b.startedAt === null || now.getTime() - b.startedAt.getTime() > STALE_RUN_MS);
      if (b.status !== "simulated" && !stale) {
        throw invalidState("Este lote ya se ha ejecutado o está en ejecución");
      }
      await this.d.repo.updateBatch(tx, id, { status: "running", startedAt: now });
      await this.d.audit.record(tx, ctx, {
        action: "import.batch_started",
        entityType: "import_batch",
        entityId: id,
        after: { entity: b.entity, filename: b.filename, rows: b.stats.total },
      });
      return { ...b, status: "running" as const, startedAt: now };
    });
    const run = this.run(ctx, batch)
      .catch((err) => this.d.logger.error({ err, batchId: id }, "fallo ejecutando importación"))
      .finally(() => this.inflight.delete(id));
    this.inflight.set(id, run);
    return this.toDto(batch);
  }

  /** Espera a que terminen las ejecuciones en curso (tests y apagado ordenado). */
  async settle(): Promise<void> {
    await Promise.all([...this.inflight.values()]);
  }

  private async run(ctx: TenantContext, batch: BatchRecord): Promise<void> {
    const ictx = importCtx(ctx);
    const stats = { ...batch.stats };
    const repo = this.d.repo;
    const db = this.d.database;
    let processed = 0;
    try {
      for (;;) {
        const page = await db.withTenant(ctx, (tx) => repo.pendingRows(tx, batch.id, PAGE));
        if (page.length === 0) break;
        for (const row of page) {
          await this.importRow(ctx, ictx, batch, row, stats);
          if (++processed % 25 === 0) {
            await db.withTenant(ctx, (tx) => repo.updateBatch(tx, batch.id, { stats }));
          }
        }
      }
      await this.finish(ctx, batch, stats, "completed");
    } catch (err) {
      this.d.logger.error({ err, batchId: batch.id }, "importación interrumpida");
      await this.finish(ctx, batch, stats, "failed");
    }
  }

  private async importRow(
    ctx: TenantContext,
    ictx: TenantContext,
    batch: BatchRecord,
    row: RowRecord,
    stats: BatchStats,
  ): Promise<void> {
    const { target, database: db, repo } = this.d;
    const mark = (status: RowStatus, errors: string[] = row.errors, action = row.action) =>
      db.withTenant(ctx, (tx) =>
        repo.updateRow(tx, batch.id, row.rowNumber, { status, errors, action }),
      );
    try {
      // Se vuelve a comprobar: el CRM pudo cambiar entre la simulación y la ejecución.
      const existing = await target.lookup(ictx, batch.entity, row.normalized);
      if (existing && batch.onDuplicate === "skip") {
        stats.skipped++;
        await mark("skipped", [`Ya existe: ${existing.label}`], "none");
        return;
      }
      if (existing) {
        const { previous, changed } = await target.fillEmpty(
          ictx,
          batch.entity,
          existing.id,
          row.normalized,
        );
        if (changed) {
          await db.withTenant(ctx, (tx) =>
            repo.insertItem(tx, {
              tenantId: ctx.tenantId,
              batchId: batch.id,
              entityType: batch.entity,
              entityId: existing.id,
              action: "updated",
              previous,
            }),
          );
          stats.updated++;
          await mark("imported", [], "update");
        } else {
          stats.skipped++;
          await mark("skipped", ["Ya existe y no hay datos nuevos que añadir"], "none");
        }
        return;
      }
      const id = await target.create(ictx, batch.entity, row.normalized);
      await db.withTenant(ctx, (tx) =>
        repo.insertItem(tx, {
          tenantId: ctx.tenantId,
          batchId: batch.id,
          entityType: batch.entity,
          entityId: id,
          action: "created",
          previous: null,
        }),
      );
      stats.created++;
      await mark("imported", row.errors, "create");
    } catch (err) {
      stats.failed++;
      const message =
        err instanceof AppError ? err.message : "Error inesperado al importar esta fila";
      await mark("invalid", [message], "none");
    }
  }

  private async finish(
    ctx: TenantContext,
    batch: BatchRecord,
    stats: BatchStats,
    status: "completed" | "failed",
  ): Promise<void> {
    const now = this.d.clock.now();
    await this.d.database.withTenant(ctx, async (tx) => {
      await this.d.repo.updateBatch(tx, batch.id, { status, stats, finishedAt: now });
      const event =
        status === "completed" ? EVENT_TYPES.importBatchCompleted : EVENT_TYPES.importBatchFailed;
      await publishEvent(tx, {
        id: uuidv7(),
        ...event,
        tenantId: ctx.tenantId,
        occurredAt: now.toISOString(),
        actor: { membershipId: ctx.actor.membershipId, source: "import" },
        entity: { type: "import_batch", id: batch.id },
        payload: importBatchEventV1.parse({
          batchId: batch.id,
          entity: batch.entity,
          created: stats.created,
          updated: stats.updated,
          failed: stats.failed,
        }),
      });
      await this.d.audit.record(tx, ctx, {
        action: status === "completed" ? "import.batch_completed" : "import.batch_failed",
        entityType: "import_batch",
        entityId: batch.id,
        after: { created: stats.created, updated: stats.updated, failed: stats.failed },
      });
    });
  }

  // ── Rollback del lote completo ─────────────────────────────────────────────────────────────────
  async rollback(ctx: TenantContext, id: string): Promise<{ batch: BatchDto; kept: number }> {
    const { batch, items } = await this.d.database.withTenant(ctx, async (tx) => {
      const b = await this.d.repo.getBatch(tx, id);
      if (!b) throw notFound();
      const dto = this.toDto(b);
      if (!dto.canRollback) {
        throw invalidState(
          "Este lote no se puede deshacer (no está completado o pasó la ventana de 30 días)",
        );
      }
      return { batch: b, items: await this.d.repo.itemsOfBatch(tx, id) };
    });

    const ictx = importCtx(ctx);
    let kept = 0;
    // En orden inverso: primero lo último que se hizo.
    for (const item of [...items].reverse()) {
      try {
        if (item.action === "created")
          await this.d.target.remove(ictx, item.entityType, item.entityId);
        else if (item.previous)
          await this.d.target.revertFill(ictx, item.entityType, item.entityId, item.previous);
      } catch {
        // El usuario ya ha cambiado ese registro (p. ej. le colgó oportunidades): no se toca y se avisa.
        kept++;
      }
    }

    const now = this.d.clock.now();
    return this.d.database.withTenant(ctx, async (tx) => {
      await this.d.repo.updateBatch(tx, id, { status: "rolled_back", rolledBackAt: now });
      await publishEvent(tx, {
        id: uuidv7(),
        ...EVENT_TYPES.importBatchRolledBack,
        tenantId: ctx.tenantId,
        occurredAt: now.toISOString(),
        actor: { membershipId: ctx.actor.membershipId, source: "user" },
        entity: { type: "import_batch", id },
        payload: importBatchEventV1.parse({
          batchId: id,
          entity: batch.entity,
          created: batch.stats.created,
          updated: batch.stats.updated,
          failed: batch.stats.failed,
        }),
      });
      await this.d.audit.record(tx, ctx, {
        action: "import.batch_rolled_back",
        entityType: "import_batch",
        entityId: id,
        after: { reverted: items.length - kept, kept },
      });
      const updated = await this.d.repo.getBatch(tx, id);
      if (!updated) throw notFound();
      return { batch: this.toDto(updated), kept };
    });
  }

  // ── Exportación (portabilidad) ────────────────────────────────────────────────────────────────
  async exportCsv(ctx: TenantContext, entity: Entity): Promise<string> {
    const all: Fields[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.d.target.exportPage(ctx, entity, cursor);
      all.push(...page.rows);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const headers =
      entity === "companies"
        ? [
            "name",
            "legalName",
            "taxId",
            "domain",
            "industry",
            "website",
            "phone",
            "status",
            "owner",
            "notes",
          ]
        : ["firstName", "lastName", "email", "phone", "jobTitle", "company", "status", "owner"];
    return toCsv(headers, all);
  }
}
