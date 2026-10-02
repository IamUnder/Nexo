import { z } from "zod";

/** Tipos permitidos de subida (lista cerrada; ampliar con criterio de seguridad). */
export const ALLOWED_UPLOAD_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const requestUploadInputSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.enum(ALLOWED_UPLOAD_TYPES),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  ownerModule: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{1,30}$/)
    .default("platform"),
  entityType: z.string().max(40).optional(),
  entityId: z.string().uuid().optional(),
});
export type RequestUploadInput = z.infer<typeof requestUploadInputSchema>;

export const uploadTicketSchema = z.object({
  fileId: z.string().uuid(),
  uploadUrl: z.string().url(),
  /** Cabeceras que el cliente DEBE enviar en el PUT. */
  headers: z.record(z.string(), z.string()),
  expiresInSeconds: z.number().int(),
});
export type UploadTicket = z.infer<typeof uploadTicketSchema>;

export const fileDtoSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().nullable(),
  status: z.string(),
  ownerModule: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  createdAt: z.string(),
});
export type FileDto = z.infer<typeof fileDtoSchema>;
