import { z } from "zod";

/** Paginación por cursor (opaco). */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(200).optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export const idParamSchema = z.object({ id: z.string().uuid() });

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

/** Política de contraseñas compartida por cliente (validación temprana) y servidor (la que manda). */
export const PASSWORD_MIN_LENGTH = 12;
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "password.too_short")
  .max(200, "password.too_long");

export const emailSchema = z.string().trim().toLowerCase().email().max(254);
