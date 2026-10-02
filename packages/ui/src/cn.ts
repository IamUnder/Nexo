import clsx, { type ClassValue } from "clsx";

/** Une clases condicionales. Los componentes solo usan utilidades de tokens semánticos (sin HEX). */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}
