import {
  type AdminTenantDto,
  type CreateTenantInput,
  EVENT_TYPES,
  type SignupInput,
  type TenantDto,
  type TenantSettingsInput,
  tenantCreatedV1,
  tenantStatusChangedV1,
} from "@nexo/contracts";
import type { z } from "zod";
import type { Database, Tx } from "../../../platform/db/database";
import { withPlatform } from "../../../platform/db/platform";
import { AppError, ConflictError, NotFoundError, ValidationError } from "../../../platform/errors";
import { publishEvent } from "../../../platform/events/outbox";
import { uuidv7 } from "../../../platform/ids";
import type { AuditLogger, Clock } from "../../../platform/ports";
import type { TenantContext } from "../../../platform/tenant/context";
import { generateUniqueSlug } from "../domain/slug";
import {
  addDays,
  canOperate,
  type EffectiveStatus,
  effectiveStatus,
  isStoredStatus,
} from "../domain/status";
import type {
  MemberStats,
  OwnerProvisioner,
  SessionIssuer,
  TenantRecord,
  TenantRepository,
} from "./ports";

/** Prueba gratuita por defecto del alta self-service (PDF §08: 21 días). */
export const DEFAULT_TRIAL_DAYS = 21;

export interface TenancyDeps {
  database: Database;
  repo: TenantRepository;
  owners: OwnerProvisioner;
  sessions: SessionIssuer;
  members: MemberStats;
  audit: AuditLogger;
  clock: Clock;
}

type EventPayload<T extends z.ZodTypeAny> = z.infer<T>;

function pastDueSince(t: TenantRecord): Date | null {
  const raw = t.flags.pastDueSince;
  return typeof raw === "string" ? new Date(raw) : null;
}

export function toTenantDto(t: TenantRecord, now: Date): TenantDto {
  return {
    id: t.id,
    slug: t.slug,
    name: t.name,
    status: t.status,
    effectiveStatus: effectiveStatus(t, now),
    trialEndsAt: t.trialEndsAt ? t.trialEndsAt.toISOString() : null,
    locale: t.locale,
    timezone: t.timezone,
    currency: t.currency,
    country: t.country,
    createdAt: t.createdAt.toISOString(),
  };
}

/** Violación de UNIQUE de PostgreSQL (código 23505), también cuando Drizzle envuelve el error. */
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
}

export class TenancyService {
  constructor(private readonly d: TenancyDeps) {}

  // ── Alta ────────────────────────────────────────────────────────────────────────────────────

  /**
   * Alta self-service: crea tenant (prueba de 21 días), cuenta del propietario y membresía `owner`
   * en UNA transacción, y emite la sesión. Si el email ya tiene cuenta responde `account.exists`
   * (riesgo de enumeración aceptado y mitigado con rate limit en la ruta; ver ARCHITECTURE §7).
   */
  async signupSelfService(input: SignupInput, meta: { ip?: string; userAgent?: string }) {
    const created = await this.createTenantWithOwner({
      name: input.companyName,
      country: input.countryCode,
      status: "trial",
      trialDays: DEFAULT_TRIAL_DAYS,
      origin: "self_service",
      billingMode: "stripe",
      templateKey: input.templateKey,
      owner: { email: input.email, fullName: input.fullName, password: input.password },
      actor: { type: "owner" },
    });
    const session = await this.d.sessions.issue({
      userId: created.userId,
      membershipId: created.membershipId,
      ...meta,
    });
    return { tenantId: created.tenantId, session };
  }

  /** Alta manual (superadmin): el propietario recibe un email para fijar su contraseña. */
  async createTenantManually(superadminId: string, input: CreateTenantInput) {
    const created = await this.createTenantWithOwner({
      name: input.companyName,
      country: input.countryCode,
      status: input.trialDays > 0 ? "trial" : "active",
      trialDays: input.trialDays,
      origin: "manual",
      billingMode: input.billingMode,
      templateKey: "professional_services",
      owner: { email: input.ownerEmail, fullName: input.ownerFullName, password: undefined },
      actor: { type: "superadmin", superadminId },
    });
    return this.getForAdmin(created.tenantId);
  }

  private async createTenantWithOwner(args: {
    name: string;
    country: string;
    status: "trial" | "active";
    trialDays: number;
    origin: "self_service" | "manual";
    billingMode: "stripe" | "manual";
    templateKey: string;
    owner: { email: string; fullName: string; password: string | undefined };
    actor: { type: "owner" } | { type: "superadmin"; superadminId: string };
  }) {
    const { repo, owners, audit, clock, database } = this.d;
    const now = clock.now();

    // Reintento si dos altas simultáneas eligen el mismo slug (la BD lo impide con UNIQUE).
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await withPlatform(
          database,
          "alta de tenant (transversal a tenants)",
          async (tx) => {
            const slug = await generateUniqueSlug(args.name, (s) => repo.slugExists(tx, s));
            const trialEndsAt = args.status === "trial" ? addDays(now, args.trialDays) : null;
            const tenant = await repo.insert(tx, {
              slug,
              name: args.name,
              status: args.status,
              trialEndsAt,
              origin: args.origin,
              country: args.country,
            });

            const owner = await owners.provisionOwner(tx, {
              tenantId: tenant.id,
              tenantName: tenant.name,
              email: args.owner.email,
              fullName: args.owner.fullName,
              password: args.owner.password,
            });
            if (!owner.isNewUser && args.owner.password !== undefined) {
              // Alta self-service con un email que ya tiene cuenta: debe iniciar sesión, no registrarse.
              throw new AccountExistsError();
            }

            await repo.putSetting(tx, tenant.id, "template", args.templateKey);
            await repo.putSetting(tx, tenant.id, "billing_mode", args.billingMode);

            const ctx: TenantContext = {
              tenantId: tenant.id,
              actor: { membershipId: owner.membershipId, source: "user" },
            };
            const auditEntry = {
              action: "tenancy.tenant.created",
              entityType: "tenant",
              entityId: tenant.id,
              after: { slug, name: tenant.name, origin: args.origin, status: args.status },
            };
            if (args.actor.type === "superadmin") {
              await audit.recordPlatform(tx, { superadminId: args.actor.superadminId }, auditEntry);
            }
            await audit.record(tx, ctx, auditEntry);

            const payload: EventPayload<typeof tenantCreatedV1> = {
              tenantId: tenant.id,
              slug,
              name: tenant.name,
              origin: args.origin,
              billingMode: args.billingMode,
              trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
              ownerUserId: owner.userId,
              ownerMembershipId: owner.membershipId,
              ownerIsNewUser: owner.isNewUser,
              templateKey: args.templateKey,
            };
            await publishEvent(tx, {
              id: uuidv7(),
              ...EVENT_TYPES.tenantCreated,
              tenantId: tenant.id,
              occurredAt: now.toISOString(),
              actor: { membershipId: owner.membershipId, source: "user" },
              entity: { type: "tenant", id: tenant.id },
              payload: tenantCreatedV1.parse(payload),
            });

            return {
              tenantId: tenant.id,
              userId: owner.userId,
              membershipId: owner.membershipId,
              isNewUser: owner.isNewUser,
            };
          },
        );
      } catch (err) {
        if (isUniqueViolation(err) && attempt < 2) continue;
        throw err;
      }
    }
    throw new ConflictError("No se pudo reservar un identificador único para el tenant");
  }

  // ── Superadmin ──────────────────────────────────────────────────────────────────────────────

  async listForAdmin(query: {
    limit: number;
    cursor?: string | undefined;
    search?: string | undefined;
    status?: string | undefined;
  }) {
    const now = this.d.clock.now();
    return withPlatform(this.d.database, "listado de tenants (superadmin)", async (tx) => {
      const page = await this.d.repo.list(tx, query);
      const counts = await this.d.members.countByTenant(
        tx,
        page.items.map((t) => t.id),
      );
      const settings = await Promise.all(page.items.map((t) => this.d.repo.getSettings(tx, t.id)));
      return {
        items: page.items.map((t, i) =>
          this.toAdminDto(t, now, counts.get(t.id) ?? 0, settings[i] ?? {}),
        ),
        nextCursor: page.nextCursor,
      };
    });
  }

  async getForAdmin(id: string): Promise<AdminTenantDto> {
    const now = this.d.clock.now();
    return withPlatform(this.d.database, "detalle de tenant (superadmin)", async (tx) => {
      const t = await this.d.repo.findById(tx, id);
      if (!t) throw new NotFoundError("tenant");
      const counts = await this.d.members.countByTenant(tx, [id]);
      return this.toAdminDto(t, now, counts.get(id) ?? 0, await this.d.repo.getSettings(tx, id));
    });
  }

  private toAdminDto(
    t: TenantRecord,
    now: Date,
    memberCount: number,
    settings: Record<string, unknown>,
  ): AdminTenantDto {
    return {
      ...toTenantDto(t, now),
      origin: t.origin,
      isDemo: t.isDemo,
      billingMode: typeof settings.billing_mode === "string" ? settings.billing_mode : "manual",
      memberCount,
    };
  }

  /** El superadmin cambia el estado (suspender, reactivar, cancelar…). Siempre con motivo y auditado. */
  async updateStatus(
    superadminId: string,
    tenantId: string,
    status: string,
    reason: string,
  ): Promise<AdminTenantDto> {
    if (!isStoredStatus(status)) throw new ValidationError("estado no válido");
    const now = this.d.clock.now();
    await withPlatform(this.d.database, "cambio de estado de tenant (superadmin)", async (tx) => {
      const current = await this.d.repo.findById(tx, tenantId);
      if (!current) throw new NotFoundError("tenant");
      if (current.status === status) throw new ConflictError("El tenant ya tiene ese estado");

      const flags = { ...current.flags };
      if (status === "past_due") flags.pastDueSince = now.toISOString();
      else delete flags.pastDueSince;

      await this.d.repo.update(tx, tenantId, {
        status,
        flags,
        // Reactivar una prueba ya caducada sin ampliarla la dejaría caducada: se indica con extend-trial.
      });

      await this.d.audit.recordPlatform(
        tx,
        { superadminId },
        {
          action: "tenancy.tenant.status_changed",
          entityType: "tenant",
          entityId: tenantId,
          before: { status: current.status },
          after: { status },
          metadata: { reason },
        },
      );
      await publishEvent(tx, {
        id: uuidv7(),
        ...EVENT_TYPES.tenantStatusChanged,
        tenantId,
        occurredAt: now.toISOString(),
        actor: { membershipId: null, source: "system" },
        entity: { type: "tenant", id: tenantId },
        payload: tenantStatusChangedV1.parse({
          tenantId,
          from: current.status,
          to: status,
          reason,
        }),
      });
    });
    return this.getForAdmin(tenantId);
  }

  /** Amplía la prueba: parte de `max(ahora, fin actual)` para no «regalar» días ya vencidos. */
  async extendTrial(
    superadminId: string,
    tenantId: string,
    days: number,
    reason: string,
  ): Promise<AdminTenantDto> {
    const now = this.d.clock.now();
    await withPlatform(this.d.database, "ampliación de prueba (superadmin)", async (tx) => {
      const current = await this.d.repo.findById(tx, tenantId);
      if (!current) throw new NotFoundError("tenant");
      if (current.status !== "trial")
        throw new ConflictError("Solo se puede ampliar la prueba de un tenant en prueba");
      const base = current.trialEndsAt && current.trialEndsAt > now ? current.trialEndsAt : now;
      const trialEndsAt = addDays(base, days);
      await this.d.repo.update(tx, tenantId, { trialEndsAt });
      await this.d.audit.recordPlatform(
        tx,
        { superadminId },
        {
          action: "tenancy.tenant.trial_extended",
          entityType: "tenant",
          entityId: tenantId,
          before: { trialEndsAt: current.trialEndsAt?.toISOString() ?? null },
          after: { trialEndsAt: trialEndsAt.toISOString() },
          metadata: { reason, days },
        },
      );
    });
    return this.getForAdmin(tenantId);
  }

  // ── Tenant propio ───────────────────────────────────────────────────────────────────────────

  async getOwn(ctx: TenantContext): Promise<TenantDto> {
    const now = this.d.clock.now();
    // `tenants` solo expone SU fila a nexo_app (política tenant_self).
    const t = await this.d.database.withTenant(ctx, (tx) => this.d.repo.findById(tx, ctx.tenantId));
    if (!t) throw new NotFoundError("tenant");
    return toTenantDto(t, now);
  }

  /**
   * Ajustes del tenant (nombre, idioma, zona horaria, moneda). `tenants` es de plataforma: la escritura
   * se hace con el pool de plataforma filtrando por el tenant del TOKEN (nunca de la petición).
   */
  async updateOwnSettings(ctx: TenantContext, input: TenantSettingsInput): Promise<TenantDto> {
    const now = this.d.clock.now();
    const updated = await withPlatform(this.d.database, "ajustes del propio tenant", async (tx) => {
      const before = await this.d.repo.findById(tx, ctx.tenantId);
      if (!before) throw new NotFoundError("tenant");
      const patch: Parameters<TenantRepository["update"]>[2] = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.locale !== undefined) patch.locale = input.locale;
      if (input.timezone !== undefined) patch.timezone = input.timezone;
      if (input.currency !== undefined) patch.currency = input.currency;
      const after = await this.d.repo.update(tx, ctx.tenantId, patch);
      await this.d.audit.record(tx, ctx, {
        action: "tenancy.settings.updated",
        entityType: "tenant",
        entityId: ctx.tenantId,
        before: {
          name: before.name,
          locale: before.locale,
          timezone: before.timezone,
          currency: before.currency,
        },
        after: {
          name: after.name,
          locale: after.locale,
          timezone: after.timezone,
          currency: after.currency,
        },
      });
      return after;
    });
    return toTenantDto(updated, now);
  }

  // ── Puertas hacia otros módulos ─────────────────────────────────────────────────────────────

  /** Resúmenes de tenants para el selector de empresa de identity (pool de plataforma). */
  async summaries(tx: Tx, ids: string[]) {
    const out: Array<{
      id: string;
      name: string;
      slug: string;
      status: string;
      locale: string;
      timezone: string;
      currency: string;
      trialEndsAt: string | null;
    }> = [];
    for (const id of ids) {
      const t = await this.d.repo.findById(tx, id);
      if (!t) continue;
      out.push({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: effectiveStatus(t, this.d.clock.now()),
        locale: t.locale,
        timezone: t.timezone,
        currency: t.currency,
        trialEndsAt: t.trialEndsAt ? t.trialEndsAt.toISOString() : null,
      });
    }
    return out;
  }

  /** ¿Puede el tenant operar? Lo usa el guard (tx ya con contexto de tenant). */
  async stateFor(
    tx: Tx,
    tenantId: string,
  ): Promise<{ effective: EffectiveStatus; canOperate: boolean } | null> {
    const t = await this.d.repo.findById(tx, tenantId);
    if (!t) return null;
    const now = this.d.clock.now();
    const effective = effectiveStatus(t, now);
    return { effective, canOperate: canOperate(effective, pastDueSince(t), now) };
  }
}

/** Alta self-service con email ya registrado: debe iniciar sesión (409 `account.exists`). */
export class AccountExistsError extends AppError {
  constructor() {
    super("account.exists", 409, "El email ya tiene una cuenta");
  }
}
