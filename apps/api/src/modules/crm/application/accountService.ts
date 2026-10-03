import {
  type AccountDto,
  accountEventV1,
  type CreateAccountInput,
  EVENT_TYPES,
  type Page,
  type UpdateAccountInput,
} from "@nexo/contracts";
import { AppError } from "../../../platform/errors";
import type { TenantContext } from "../../../platform/tenant/context";
import type { AccountRow, ListFilter } from "./ports";
import {
  type Access,
  type CrmDeps,
  emit,
  nameMap,
  notFound,
  ownerOnly,
  resolveOwner,
  toAccountDto,
} from "./shared";

const accountEvent = (a: AccountRow) =>
  accountEventV1.parse({
    accountId: a.id,
    name: a.name,
    ownerId: a.ownerMembershipId,
    status: a.status,
  });

/** Empresas (clientes y prospectos). Todo bajo `withTenant`: RLS + filtro de alcance `own`. */
export class AccountService {
  constructor(private readonly d: CrmDeps) {}

  async create(ctx: TenantContext, access: Access, input: CreateAccountInput): Promise<AccountDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const owner = await resolveOwner(this.d, tx, ctx, access, input.ownerId);
      const id = await this.d.repo.insertAccount(tx, {
        tenantId: ctx.tenantId,
        name: input.name,
        legalName: input.legalName ?? null,
        taxId: input.taxId ?? null,
        domain: input.domain?.toLowerCase() ?? null,
        industry: input.industry ?? null,
        website: input.website ?? null,
        phone: input.phone ?? null,
        status: input.status,
        source: input.source ?? null,
        notes: input.notes ?? null,
        ownerMembershipId: owner,
      });
      const row = await this.d.repo.findAccount(tx, id);
      if (!row) throw notFound("empresa");
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.accountCreated,
        { type: "account", id },
        accountEvent(row),
      );
      return toAccountDto(row, await nameMap(this.d, tx, [row.ownerMembershipId]));
    });
  }

  async get(ctx: TenantContext, access: Access, id: string): Promise<AccountDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const row = await this.d.repo.findAccount(tx, id, ownerOnly(ctx, access));
      if (!row) throw notFound("empresa");
      return toAccountDto(row, await nameMap(this.d, tx, [row.ownerMembershipId]));
    });
  }

  async list(
    ctx: TenantContext,
    access: Access,
    q: Omit<ListFilter, "ownerOnly">,
  ): Promise<Page<AccountDto>> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const page = await this.d.repo.listAccounts(tx, { ...q, ownerOnly: ownerOnly(ctx, access) });
      const names = await nameMap(
        this.d,
        tx,
        page.items.map((a) => a.ownerMembershipId),
      );
      return { items: page.items.map((a) => toAccountDto(a, names)), nextCursor: page.nextCursor };
    });
  }

  async update(
    ctx: TenantContext,
    access: Access,
    id: string,
    input: UpdateAccountInput,
  ): Promise<AccountDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const current = await this.d.repo.findAccount(tx, id, ownerOnly(ctx, access));
      if (!current) throw notFound("empresa");

      const patch: Parameters<typeof this.d.repo.updateAccount>[2] = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.legalName !== undefined) patch.legalName = input.legalName || null;
      if (input.taxId !== undefined) patch.taxId = input.taxId || null;
      if (input.domain !== undefined)
        patch.domain = input.domain ? input.domain.toLowerCase() : null;
      if (input.industry !== undefined) patch.industry = input.industry || null;
      if (input.website !== undefined) patch.website = input.website || null;
      if (input.phone !== undefined) patch.phone = input.phone || null;
      if (input.status !== undefined) patch.status = input.status;
      if (input.source !== undefined) patch.source = input.source || null;
      if (input.notes !== undefined) patch.notes = input.notes || null;
      if (input.ownerId !== undefined)
        patch.ownerMembershipId = await resolveOwner(this.d, tx, ctx, access, input.ownerId);

      await this.d.repo.updateAccount(tx, id, patch);
      const row = await this.d.repo.findAccount(tx, id);
      if (!row) throw notFound("empresa");
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.accountUpdated,
        { type: "account", id },
        accountEvent(row),
      );
      return toAccountDto(row, await nameMap(this.d, tx, [row.ownerMembershipId]));
    });
  }

  /** Borrado lógico. No se borra una empresa con oportunidades abiertas (primero hay que cerrarlas). */
  async delete(ctx: TenantContext, access: Access, id: string): Promise<void> {
    await this.d.database.withTenant(ctx, async (tx) => {
      const row = await this.d.repo.findAccount(tx, id, ownerOnly(ctx, access));
      if (!row) throw notFound("empresa");
      if ((await this.d.repo.countOpenDealsOfAccount(tx, id)) > 0) {
        throw new AppError(
          "crm.account_has_open_deals",
          409,
          "La empresa tiene oportunidades abiertas",
        );
      }
      await this.d.repo.softDeleteAccount(tx, id);
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.accountDeleted,
        { type: "account", id },
        accountEvent(row),
      );
      await this.d.audit.record(tx, ctx, {
        action: "crm.account_deleted",
        entityType: "account",
        entityId: id,
        before: { name: row.name },
      });
    });
  }
}
