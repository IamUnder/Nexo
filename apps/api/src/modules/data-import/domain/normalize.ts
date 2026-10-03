/**
 * Normalización y validación de filas importadas (MODULES_SPEC §6.3). Dominio puro: sin I/O.
 * Aplica las peculiaridades españolas (NIF/CIF, teléfonos con espacios o prefijo, nombres completos).
 */
export type ImportEntityName = "companies" | "contacts";
export type FieldMap = Record<string, string>;

export interface NormalizedRow {
  fields: FieldMap;
  errors: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Clave de comparación: sin tildes, minúsculas, espacios simples. Sirve para detectar repetidos. */
export function foldKey(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** NIF/CIF/NIE en mayúsculas y sin espacios, guiones ni puntos. */
export function normalizeTaxId(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Dominio sin protocolo, `www.` ni ruta: `https://www.Acme.es/inicio` → `acme.es`. */
export function domainOf(raw: string): string {
  return (
    raw
      .trim()
      .toLowerCase()
      .replace(/^[a-z]+:\/\//, "")
      .replace(/^www\./, "")
      .split(/[/?#]/)[0]
      ?.replace(/:\d+$/, "")
      .trim() ?? ""
  );
}

/** Teléfono: conserva `+` inicial y dígitos; `+34 612 345 678` → `+34612345678`. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  return trimmed.startsWith("+") || trimmed.startsWith("00")
    ? `+${trimmed.startsWith("00") ? digits.slice(2) : digits}`
    : digits;
}

/** «Ana María Pérez López» → nombre «Ana», apellidos «María Pérez López». */
export function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

const MAX = { name: 160, text: 200, notes: 4000 } as const;

function website(raw: string): string {
  const t = raw.trim();
  return /^[a-z]+:\/\//i.test(t) ? t : `https://${t}`;
}

export function normalizeCompany(input: FieldMap): NormalizedRow {
  const errors: string[] = [];
  const f: FieldMap = {};
  const name = (input.name ?? "").trim();
  if (name.length < 2) errors.push("El nombre de la empresa es obligatorio (mín. 2 caracteres)");
  else if (name.length > MAX.name) errors.push(`El nombre supera ${MAX.name} caracteres`);
  else f.name = name;

  const put = (key: string, value: string | undefined, max: number = MAX.text) => {
    const v = (value ?? "").trim();
    if (!v) return;
    if (v.length > max) errors.push(`«${key}» supera ${max} caracteres`);
    else f[key] = v;
  };
  put("legalName", input.legalName);
  if (input.taxId?.trim()) f.taxId = normalizeTaxId(input.taxId);
  const rawDomain = input.domain?.trim() || input.website?.trim();
  if (rawDomain) {
    const d = domainOf(rawDomain);
    if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) f.domain = d;
    else if (input.domain?.trim()) errors.push("El dominio no es válido");
  }
  put("industry", input.industry);
  if (input.website?.trim()) f.website = website(input.website);
  if (input.phone?.trim()) f.phone = normalizePhone(input.phone);
  put("notes", input.notes, MAX.notes);
  return { fields: f, errors };
}

export function normalizeContact(input: FieldMap): NormalizedRow {
  const errors: string[] = [];
  const f: FieldMap = {};
  let first = (input.firstName ?? "").trim();
  let last = (input.lastName ?? "").trim();
  if (!first && input.fullName?.trim()) {
    const split = splitFullName(input.fullName);
    first = split.firstName;
    if (!last) last = split.lastName;
  }
  if (!first) errors.push("El nombre del contacto es obligatorio");
  else if (first.length > 100) errors.push("El nombre supera 100 caracteres");
  else f.firstName = first;
  if (last) {
    if (last.length > 100) errors.push("Los apellidos superan 100 caracteres");
    else f.lastName = last;
  }
  const email = (input.email ?? "").trim().toLowerCase();
  if (email) {
    if (EMAIL.test(email) && email.length <= 254) f.email = email;
    else errors.push("El email no es válido");
  }
  if (input.phone?.trim()) f.phone = normalizePhone(input.phone);
  const job = (input.jobTitle ?? "").trim();
  if (job) {
    if (job.length > 100) errors.push("El cargo supera 100 caracteres");
    else f.jobTitle = job;
  }
  if (input.companyName?.trim()) f.companyName = input.companyName.trim();
  return { fields: f, errors };
}

/** Aplica el mapeo `campo → columna` a una fila cruda. Las columnas ausentes quedan vacías. */
export function applyMapping(
  mapping: Record<string, string>,
  raw: Record<string, string>,
): FieldMap {
  const out: FieldMap = {};
  for (const [field, column] of Object.entries(mapping)) {
    if (column) out[field] = raw[column] ?? "";
  }
  return out;
}

/** ¿El mapeo cubre los campos obligatorios y solo usa campos y columnas válidos? Devuelve el problema o `null`. */
export function validateMapping(
  entity: ImportEntityName,
  mapping: Record<string, string>,
  columns: Set<string>,
): string | null {
  const required = entity === "companies" ? [["name"]] : [["firstName", "fullName"]];
  const allowed =
    entity === "companies"
      ? ["name", "legalName", "taxId", "domain", "industry", "website", "phone", "notes"]
      : ["firstName", "lastName", "fullName", "email", "phone", "jobTitle", "companyName"];
  for (const field of Object.keys(mapping)) {
    if (!allowed.includes(field)) return `campo desconocido: ${field}`;
  }
  for (const column of Object.values(mapping)) {
    if (column && !columns.has(column)) return `columna inexistente: ${column}`;
  }
  for (const anyOf of required) {
    if (!anyOf.some((f) => mapping[f])) return `falta mapear ${anyOf.join(" o ")}`;
  }
  return null;
}

/** Clave de identidad dentro del fichero (para detectar filas repetidas en el propio CSV). */
export function identityKey(entity: ImportEntityName, f: FieldMap): string | null {
  if (entity === "contacts") return f.email ? `email:${f.email}` : null;
  if (f.taxId) return `tax:${f.taxId}`;
  return f.name ? `name:${foldKey(f.name)}` : null;
}

export function rowLabel(entity: ImportEntityName, f: FieldMap, raw: FieldMap): string {
  if (entity === "companies") return f.name ?? Object.values(raw)[0] ?? "";
  return (
    [f.firstName, f.lastName].filter(Boolean).join(" ") || f.email || Object.values(raw)[0] || ""
  );
}

/** CSV para Excel en español: separador `;`, comillas dobles y BOM UTF-8. */
export function toCsv(headers: string[], rows: Array<Record<string, string>>): string {
  const cell = (v: string) => (/[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [headers.map(cell).join(";")];
  for (const r of rows) lines.push(headers.map((h) => cell(r[h] ?? "")).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
