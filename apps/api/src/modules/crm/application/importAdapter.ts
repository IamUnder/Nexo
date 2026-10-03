import type { Database } from "../../../platform/db/database";
import type { TenantContext } from "../../../platform/tenant/context";
import type { AccountService } from "./accountService";
import type { ContactService } from "./contactService";
import type { AccountRow, ContactRow, CrmRepository } from "./ports";

const ALL = { scope: "all" as const };
type Fields = Record<string, string>;
export type ImportEntityKind = "companies" | "contacts";

const ACCOUNT_FIELDS = [
  "legalName",
  "taxId",
  "domain",
  "industry",
  "website",
  "phone",
  "notes",
] as const;
const CONTACT_FIELDS = ["lastName", "phone", "jobTitle"] as const;

export interface ExistingRecord {
  id: string;
  label: string;
}

/**
 * Adaptador de importación del CRM. Cumple, por estructura, el puerto `ImportTarget` que declara el
 * módulo `data-import` (la composición los conecta; ningún módulo importa al otro). Crea con los casos
 * de uso reales (eventos y auditoría incluidos) y marca el origen como `import`.
 */
export class CrmImportAdapter {
  constructor(
    private readonly d: {
      database: Database;
      repo: CrmRepository;
      accounts: AccountService;
      contacts: ContactService;
    },
  ) {}

  /** ¿Existe ya este registro? Empresas: NIF o nombre; contactos: email. */
  async lookup(
    ctx: TenantContext,
    entity: ImportEntityKind,
    f: Fields,
  ): Promise<ExistingRecord | null> {
    return this.d.database.withTenant(ctx, async (tx) => {
      if (entity === "companies") {
        const found = await this.d.repo.findAccountByKeys(tx, { taxId: f.taxId, name: f.name });
        return found ? { id: found.id, label: found.name } : null;
      }
      if (!f.email) return null;
      const found = await this.d.repo.findContactByEmail(tx, f.email);
      return found ? { id: found.id, label: found.email ?? found.firstName } : null;
    });
  }

  /** Resuelve el nombre o NIF de empresa de una fila de contactos a su id (solo empresas existentes). */
  async resolveCompany(ctx: TenantContext, name: string): Promise<string | null> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const found = await this.d.repo.findAccountByKeys(tx, { name, taxId: name });
      return found?.id ?? null;
    });
  }

  async create(ctx: TenantContext, entity: ImportEntityKind, f: Fields): Promise<string> {
    if (entity === "companies") {
      const created = await this.d.accounts.create(ctx, ALL, {
        name: f.name ?? "",
        ...(f.legalName ? { legalName: f.legalName } : {}),
        ...(f.taxId ? { taxId: f.taxId } : {}),
        ...(f.domain ? { domain: f.domain } : {}),
        ...(f.industry ? { industry: f.industry } : {}),
        ...(f.website ? { website: f.website } : {}),
        ...(f.phone ? { phone: f.phone } : {}),
        ...(f.notes ? { notes: f.notes } : {}),
        status: "prospect",
        source: "import",
      });
      return created.id;
    }
    const accountId = f.companyName ? await this.resolveCompany(ctx, f.companyName) : null;
    const created = await this.d.contacts.create(ctx, ALL, {
      firstName: f.firstName ?? "",
      ...(f.lastName ? { lastName: f.lastName } : {}),
      ...(f.email ? { email: f.email } : {}),
      ...(f.phone ? { phone: f.phone } : {}),
      ...(f.jobTitle ? { jobTitle: f.jobTitle } : {}),
      ...(accountId ? { accountId } : {}),
      status: "lead",
    });
    return created.id;
  }

  /**
   * Rellena SOLO los campos vacíos del registro existente (nunca pisa datos del usuario).
   * Devuelve los campos que cambió con su valor anterior (siempre vacío) para poder deshacerlo.
   */
  async fillEmpty(
    ctx: TenantContext,
    entity: ImportEntityKind,
    id: string,
    f: Fields,
  ): Promise<{ previous: Record<string, null>; changed: boolean }> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const previous: Record<string, null> = {};
      const patch: Record<string, string> = {};
      if (entity === "companies") {
        const row = await this.d.repo.findAccount(tx, id);
        if (!row) return { previous, changed: false };
        for (const k of ACCOUNT_FIELDS) {
          if (f[k] && !row[k as keyof AccountRow]) {
            patch[k] = f[k] as string;
            previous[k] = null;
          }
        }
        if (Object.keys(patch).length > 0) await this.d.repo.updateAccount(tx, id, patch);
      } else {
        const row = await this.d.repo.findContact(tx, id);
        if (!row) return { previous, changed: false };
        for (const k of CONTACT_FIELDS) {
          if (f[k] && !row[k as keyof ContactRow]) {
            patch[k] = f[k] as string;
            previous[k] = null;
          }
        }
        if (Object.keys(patch).length > 0) await this.d.repo.updateContact(tx, id, patch);
      }
      return { previous, changed: Object.keys(patch).length > 0 };
    });
  }

  /** Deshace un `fillEmpty`: vuelve a dejar vacíos los campos que el lote había rellenado. */
  async revertFill(
    ctx: TenantContext,
    entity: ImportEntityKind,
    id: string,
    previous: Record<string, null>,
  ): Promise<void> {
    await this.d.database.withTenant(ctx, async (tx) => {
      if (entity === "companies") await this.d.repo.updateAccount(tx, id, previous);
      else await this.d.repo.updateContact(tx, id, previous);
    });
  }

  /** Deshace una creación (borrado lógico con el caso de uso real). */
  async remove(ctx: TenantContext, entity: ImportEntityKind, id: string): Promise<void> {
    if (entity === "companies") await this.d.accounts.delete(ctx, ALL, id);
    else await this.d.contacts.delete(ctx, ALL, id);
  }

  /** Página de datos para exportar (portabilidad). */
  async exportPage(
    ctx: TenantContext,
    entity: ImportEntityKind,
    cursor: string | undefined,
  ): Promise<{ rows: Fields[]; nextCursor: string | null }> {
    if (entity === "companies") {
      const page = await this.d.accounts.list(ctx, ALL, { cursor, limit: 100 });
      return {
        nextCursor: page.nextCursor,
        rows: page.items.map((a) => ({
          name: a.name,
          legalName: a.legalName ?? "",
          taxId: a.taxId ?? "",
          domain: a.domain ?? "",
          industry: a.industry ?? "",
          website: a.website ?? "",
          phone: a.phone ?? "",
          status: a.status,
          owner: a.ownerName ?? "",
          notes: a.notes ?? "",
        })),
      };
    }
    const page = await this.d.contacts.list(ctx, ALL, { cursor, limit: 100 });
    return {
      nextCursor: page.nextCursor,
      rows: page.items.map((c) => ({
        firstName: c.firstName,
        lastName: c.lastName ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        jobTitle: c.jobTitle ?? "",
        company: c.accountName ?? "",
        status: c.status,
        owner: c.ownerName ?? "",
      })),
    };
  }
}
