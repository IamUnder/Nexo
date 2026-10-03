import {
  type ContactDto,
  type CreateContactInput,
  contactEventV1,
  EVENT_TYPES,
  type Page,
  type UpdateContactInput,
} from "@nexo/contracts";
import { AppError } from "../../../platform/errors";
import type { TenantContext } from "../../../platform/tenant/context";
import type { ContactRow, ListFilter } from "./ports";
import {
  type Access,
  type CrmDeps,
  emit,
  nameMap,
  notFound,
  ownerOnly,
  resolveOwner,
  toContactDto,
} from "./shared";

const contactEvent = (c: ContactRow) =>
  contactEventV1.parse({
    contactId: c.id,
    accountId: c.accountId,
    email: c.email,
    ownerId: c.ownerMembershipId,
  });

const emailTaken = () =>
  new AppError("crm.contact_email_taken", 409, "Ya existe un contacto con ese email");

/** Violación de UNIQUE (23505): carrera entre dos altas del mismo email. */
const isUnique = (e: unknown) => {
  const x = e as { code?: string; cause?: { code?: string } };
  return x.code === "23505" || x.cause?.code === "23505";
};

export class ContactService {
  constructor(private readonly d: CrmDeps) {}

  async create(ctx: TenantContext, access: Access, input: CreateContactInput): Promise<ContactDto> {
    try {
      return await this.d.database.withTenant(ctx, async (tx) => {
        if (
          input.accountId &&
          !(await this.d.repo.findAccount(tx, input.accountId, ownerOnly(ctx, access)))
        ) {
          throw notFound("empresa");
        }
        if (input.email && (await this.d.repo.findContactByEmail(tx, input.email)))
          throw emailTaken();
        const owner = await resolveOwner(this.d, tx, ctx, access, input.ownerId);
        const id = await this.d.repo.insertContact(tx, {
          tenantId: ctx.tenantId,
          accountId: input.accountId ?? null,
          firstName: input.firstName,
          lastName: input.lastName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          jobTitle: input.jobTitle ?? null,
          status: input.status,
          ownerMembershipId: owner,
        });
        const row = await this.d.repo.findContact(tx, id);
        if (!row) throw notFound("contacto");
        await emit(
          this.d,
          tx,
          ctx,
          EVENT_TYPES.contactCreated,
          { type: "contact", id },
          contactEvent(row),
        );
        return toContactDto(row, await nameMap(this.d, tx, [row.ownerMembershipId]));
      });
    } catch (err) {
      if (isUnique(err)) throw emailTaken();
      throw err;
    }
  }

  async get(ctx: TenantContext, access: Access, id: string): Promise<ContactDto> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const row = await this.d.repo.findContact(tx, id, ownerOnly(ctx, access));
      if (!row) throw notFound("contacto");
      return toContactDto(row, await nameMap(this.d, tx, [row.ownerMembershipId]));
    });
  }

  async list(
    ctx: TenantContext,
    access: Access,
    q: Omit<ListFilter, "ownerOnly">,
  ): Promise<Page<ContactDto>> {
    return this.d.database.withTenant(ctx, async (tx) => {
      const page = await this.d.repo.listContacts(tx, { ...q, ownerOnly: ownerOnly(ctx, access) });
      const names = await nameMap(
        this.d,
        tx,
        page.items.map((c) => c.ownerMembershipId),
      );
      return { items: page.items.map((c) => toContactDto(c, names)), nextCursor: page.nextCursor };
    });
  }

  async update(
    ctx: TenantContext,
    access: Access,
    id: string,
    input: UpdateContactInput,
  ): Promise<ContactDto> {
    try {
      return await this.d.database.withTenant(ctx, async (tx) => {
        const current = await this.d.repo.findContact(tx, id, ownerOnly(ctx, access));
        if (!current) throw notFound("contacto");

        const patch: Parameters<typeof this.d.repo.updateContact>[2] = {};
        if (input.firstName !== undefined) patch.firstName = input.firstName;
        if (input.lastName !== undefined) patch.lastName = input.lastName || null;
        if (input.phone !== undefined) patch.phone = input.phone || null;
        if (input.jobTitle !== undefined) patch.jobTitle = input.jobTitle || null;
        if (input.status !== undefined) patch.status = input.status;
        if (input.email !== undefined && input.email !== current.email) {
          if (input.email) {
            const other = await this.d.repo.findContactByEmail(tx, input.email);
            if (other && other.id !== id) throw emailTaken();
          }
          patch.email = input.email || null;
        }
        if (input.accountId !== undefined) {
          if (
            input.accountId &&
            !(await this.d.repo.findAccount(tx, input.accountId, ownerOnly(ctx, access)))
          ) {
            throw notFound("empresa");
          }
          patch.accountId = input.accountId;
        }
        if (input.ownerId !== undefined)
          patch.ownerMembershipId = await resolveOwner(this.d, tx, ctx, access, input.ownerId);

        await this.d.repo.updateContact(tx, id, patch);
        const row = await this.d.repo.findContact(tx, id);
        if (!row) throw notFound("contacto");
        await emit(
          this.d,
          tx,
          ctx,
          EVENT_TYPES.contactUpdated,
          { type: "contact", id },
          contactEvent(row),
        );
        return toContactDto(row, await nameMap(this.d, tx, [row.ownerMembershipId]));
      });
    } catch (err) {
      if (isUnique(err)) throw emailTaken();
      throw err;
    }
  }

  async delete(ctx: TenantContext, access: Access, id: string): Promise<void> {
    await this.d.database.withTenant(ctx, async (tx) => {
      const row = await this.d.repo.findContact(tx, id, ownerOnly(ctx, access));
      if (!row) throw notFound("contacto");
      await this.d.repo.softDeleteContact(tx, id);
      await emit(
        this.d,
        tx,
        ctx,
        EVENT_TYPES.contactDeleted,
        { type: "contact", id },
        contactEvent(row),
      );
    });
  }
}
