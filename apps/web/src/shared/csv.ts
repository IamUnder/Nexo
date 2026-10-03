/**
 * Lectura de CSV en el navegador, con las peculiaridades de los ficheros españoles de Excel:
 * separador `;`, comillas dobles, saltos CRLF, BOM y codificación Windows-1252 (UTF-8 si es válida).
 */

/** Decodifica el contenido de un fichero: UTF-8 estricto y, si falla, Windows-1252. Quita el BOM. */
export function decodeCsv(buffer: ArrayBuffer): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("windows-1252").decode(buffer);
  }
  return text.replace(/^﻿/, "");
}

/** Elige el separador más probable mirando la primera línea (fuera de comillas). */
export function detectDelimiter(text: string): ";" | "," | "\t" {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] ?? "";
  let inQuotes = false;
  const counts: Record<string, number> = { ";": 0, ",": 0, "\t": 0 };
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch in counts) counts[ch] = (counts[ch] ?? 0) + 1;
  }
  const best = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? [";", 0])[0];
  return (best === "," || best === "\t" ? best : ";") as ";" | "," | "\t";
}

/** Analiza CSV (RFC 4180): comillas, comillas dobles escapadas, saltos dentro de un campo. */
export function parseCsv(text: string, delimiter: string = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface CsvTable {
  headers: string[];
  rows: Array<Record<string, string>>;
}

/** Primera fila = cabeceras (únicas y sin vacías); las filas totalmente vacías se descartan. */
export function toTable(rows: string[][]): CsvTable {
  const [head = [], ...body] = rows;
  const seen = new Map<string, number>();
  const headers = head.map((h, i) => {
    const base = h.trim() || `Columna ${i + 1}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base} (${n})`;
  });
  const records = body
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
  return { headers, rows: records };
}

/** Atajo: texto → tabla. */
export const readCsv = (text: string): CsvTable => toTable(parseCsv(text));

/** CSV de errores descargable (separador `;`, BOM para Excel). */
export function buildCsv(headers: string[], rows: string[][]): string {
  const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return `﻿${[headers, ...rows].map((r) => r.map(cell).join(";")).join("\r\n")}\r\n`;
}
