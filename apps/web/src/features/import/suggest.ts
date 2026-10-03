import type { ImportEntity } from "@nexo/contracts";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** Sinónimos habituales de las cabeceras de CRMs y hojas de cálculo (ES/EN). El orden de campos importa. */
const SYNONYMS: Record<ImportEntity, Array<[field: string, words: string[]]>> = {
  companies: [
    ["taxId", ["cif", "nif", "vat", "tax", "fiscal"]],
    ["legalName", ["razon social", "legal"]],
    ["name", ["empresa", "company", "organization", "organizacion", "cliente", "nombre", "name"]],
    ["domain", ["dominio", "domain"]],
    ["website", ["web", "sitio", "url", "website"]],
    ["industry", ["sector", "industria", "industry"]],
    ["phone", ["telefono", "movil", "phone", "tel"]],
    ["notes", ["notas", "comentario", "observacion", "notes"]],
  ],
  contacts: [
    ["email", ["email", "e-mail", "correo", "mail"]],
    ["fullName", ["nombre completo", "full name", "contacto", "contact name"]],
    ["lastName", ["apellido", "last name", "surname"]],
    ["firstName", ["nombre", "first name", "name"]],
    ["companyName", ["empresa", "company", "organization", "organizacion"]],
    ["jobTitle", ["cargo", "puesto", "job", "title", "position"]],
    ["phone", ["telefono", "movil", "phone", "tel"]],
  ],
};

/**
 * Propone un mapeo `campo → columna`. Cada columna se asigna como mucho una vez; primero coincidencias
 * exactas y después por inclusión, respetando el orden de los campos (los más específicos primero).
 */
export function suggestMapping(entity: ImportEntity, headers: string[]): Record<string, string> {
  const folded = headers.map((h) => [h, fold(h)] as const);
  const used = new Set<string>();
  const mapping: Record<string, string> = {};
  for (const mode of ["exact", "contains"] as const) {
    for (const [field, words] of SYNONYMS[entity]) {
      if (mapping[field]) continue;
      const hit = folded.find(
        ([h, f]) => !used.has(h) && words.some((w) => (mode === "exact" ? f === w : f.includes(w))),
      );
      if (hit) {
        mapping[field] = hit[0];
        used.add(hit[0]);
      }
    }
  }
  return mapping;
}
