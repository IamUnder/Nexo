import {
  ALLOWED_UPLOAD_TYPES,
  type FileDto,
  MAX_UPLOAD_BYTES,
  type RequestUploadInput,
  type UploadTicket,
} from "@nexo/contracts";
import type { Database } from "../../../platform/db/database";
import {
  ConflictError,
  LimitExceededError,
  NotFoundError,
  ValidationError,
} from "../../../platform/errors";
import { uuidv7 } from "../../../platform/ids";
import type { AuditLogger, FileStorage } from "../../../platform/ports";
import type { TenantContext } from "../../../platform/tenant/context";
import type { FileRecord, FileRepository, StorageLimit } from "./ports";

const UPLOAD_TTL_SECONDS = 600;

export const toFileDto = (f: FileRecord): FileDto => ({
  id: f.id,
  filename: f.filename,
  contentType: f.contentType,
  sizeBytes: f.sizeBytes,
  status: f.status,
  ownerModule: f.ownerModule,
  entityType: f.entityType,
  entityId: f.entityId,
  createdAt: f.createdAt.toISOString(),
});

/** Nombre seguro para la clave del objeto: sin rutas, sin caracteres de control, longitud acotada. */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "archivo";
  const cleaned = base
    .normalize("NFKD")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 120);
  return cleaned || "archivo";
}

export class FileService {
  constructor(
    private readonly d: {
      database: Database;
      repo: FileRepository;
      storage: FileStorage;
      limit: StorageLimit;
      audit: AuditLogger;
    },
  ) {}

  /**
   * Paso 1: reserva el archivo (`pending`) y devuelve una URL firmada de subida. La CLAVE del objeto la
   * construye SIEMPRE el servidor (`t/<tenant>/<módulo>/<id>/<nombre>`); nunca se acepta una ruta del cliente.
   */
  async requestUpload(ctx: TenantContext, input: RequestUploadInput): Promise<UploadTicket> {
    if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(input.contentType)) {
      throw new ValidationError("tipo de archivo no permitido");
    }
    if (input.sizeBytes > MAX_UPLOAD_BYTES) throw new ValidationError("archivo demasiado grande");

    const id = uuidv7();
    const key = `t/${ctx.tenantId}/${input.ownerModule}/${id}/${safeFilename(input.filename)}`;

    await this.d.database.withTenant(ctx, async (tx) => {
      const limit = await this.d.limit.limitBytes(tx, ctx.tenantId);
      if (limit !== null) {
        const used = await this.d.repo.usedBytes(tx);
        if (used + input.sizeBytes > limit) throw new LimitExceededError("storage_bytes", limit);
      }
      await this.d.repo.insert(tx, {
        id,
        tenantId: ctx.tenantId,
        ownerModule: input.ownerModule,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        storageKey: key,
        filename: safeFilename(input.filename),
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        uploadedBy: ctx.actor.membershipId,
      });
    });

    const uploadUrl = await this.d.storage.presignUpload(key, input.contentType, input.sizeBytes);
    return {
      fileId: id,
      uploadUrl,
      headers: { "content-type": input.contentType },
      expiresInSeconds: UPLOAD_TTL_SECONDS,
    };
  }

  /** Paso 2: el cliente avisa de que subió el objeto; se verifica en el almacenamiento antes de darlo por bueno. */
  async confirmUpload(ctx: TenantContext, id: string): Promise<FileDto> {
    const file = await this.d.database.withTenant(ctx, (tx) => this.d.repo.findById(tx, id));
    if (!file || file.status === "deleted") throw new NotFoundError("archivo");
    if (file.status === "ready") return toFileDto(file);

    const head = await this.d.storage.head(file.storageKey);
    if (!head) throw new ConflictError("El archivo todavía no se ha subido");
    if (head.size > MAX_UPLOAD_BYTES) throw new ValidationError("archivo demasiado grande");
    if (file.sizeBytes !== null && head.size !== file.sizeBytes) {
      await this.d.storage.delete(file.storageKey); // no coincide con lo declarado: se descarta
      await this.d.database.withTenant(ctx, (tx) => this.d.repo.markDeleted(tx, id));
      throw new ValidationError("el tamaño subido no coincide con el declarado");
    }

    return this.d.database.withTenant(ctx, async (tx) => {
      const ready = await this.d.repo.markReady(tx, id, head.size);
      await this.d.audit.record(tx, ctx, {
        action: "files.file_uploaded",
        entityType: "file",
        entityId: id,
        after: { filename: ready.filename, sizeBytes: head.size, ownerModule: ready.ownerModule },
      });
      return toFileDto(ready);
    });
  }

  async list(
    ctx: TenantContext,
    filter: {
      ownerModule?: string | undefined;
      entityType?: string | undefined;
      entityId?: string | undefined;
    },
  ): Promise<FileDto[]> {
    const rows = await this.d.database.withTenant(ctx, (tx) => this.d.repo.list(tx, filter));
    return rows.filter((f) => f.status === "ready").map(toFileDto);
  }

  /** URL de descarga firmada y de vida corta. 404 si no existe o es de otro tenant (RLS). */
  async downloadUrl(ctx: TenantContext, id: string): Promise<{ url: string }> {
    const file = await this.d.database.withTenant(ctx, (tx) => this.d.repo.findById(tx, id));
    if (!file || file.status !== "ready") throw new NotFoundError("archivo");
    return { url: await this.d.storage.presignDownload(file.storageKey, file.filename) };
  }

  async delete(ctx: TenantContext, id: string): Promise<void> {
    const file = await this.d.database.withTenant(ctx, (tx) => this.d.repo.findById(tx, id));
    if (!file || file.status === "deleted") throw new NotFoundError("archivo");
    await this.d.database.withTenant(ctx, async (tx) => {
      await this.d.repo.markDeleted(tx, id);
      await this.d.audit.record(tx, ctx, {
        action: "files.file_deleted",
        entityType: "file",
        entityId: id,
        before: { filename: file.filename },
      });
    });
    await this.d.storage.delete(file.storageKey);
  }
}
