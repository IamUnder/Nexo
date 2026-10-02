import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "../../../platform/db/schema";

/**
 * Esquema del módulo `identity` (MODULES_SPEC §2.2). Prefijo: sin prefijo por ser identidad global.
 *
 * Qué es GLOBAL (sin `tenant_id`, no visible para `nexo_app` salvo lo indicado):
 *   users · superadmins · refresh_tokens · user_tokens
 * Qué es de TENANT (RLS forzada): memberships · invitations · role_permission_overrides
 */

const uuidV7Pk = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/**
 * Identidad global de una persona (puede pertenecer a varios tenants).
 * `nexo_app` solo puede LEER columnas no sensibles de los usuarios que tienen membresía en SU tenant
 * (política `member_visibility` + GRANT por columnas; `password_hash` nunca es visible para la app).
 */
export const users = pgTable(
  "users",
  {
    id: uuidV7Pk(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    locale: text("locale").notNull().default("es"),
    status: text("status").notNull().default("active"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(sql`lower(${t.email})`)],
);

/** Superadmins de plataforma: tabla, login y tokens propios; nunca visibles para `nexo_app`. */
export const superadmins = pgTable(
  "superadmins",
  {
    id: uuidV7Pk(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    status: text("status").notNull().default("active"),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("superadmins_email_uq").on(sql`lower(${t.email})`)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuidV7Pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    seatType: text("seat_type").notNull().default("full"),
    status: text("status").notNull().default("active"),
    title: text("title"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("memberships_tenant_id_id_uq").on(t.tenantId, t.id),
    unique("memberships_tenant_user_uq").on(t.tenantId, t.userId),
    index("memberships_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuidV7Pk(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    email: text("email").notNull(),
    role: text("role").notNull(),
    seatType: text("seat_type").notNull().default("full"),
    /** Solo se guarda el HASH del token; el token en claro viaja una vez por email. */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    invitedBy: uuid("invited_by"),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique("invitations_tenant_id_id_uq").on(t.tenantId, t.id),
    index("invitations_tenant_email_idx").on(t.tenantId, sql`lower(${t.email})`),
  ],
);

/** Ajustes de permisos por rol de un tenant (el rol `owner` es inmutable y no aparece aquí). */
export const rolePermissionOverrides = pgTable(
  "role_permission_overrides",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    role: text("role").notNull(),
    permission: text("permission").notNull(),
    granted: boolean("granted").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.tenantId, t.role, t.permission] })],
);

/**
 * Refresh tokens opacos (solo su HASH), con rotación y detección de reutilización por familia
 * (ARCHITECTURE §7.3). Global: sirve a usuarios y superadmins (`subject_type`).
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuidV7Pk(),
    familyId: uuid("family_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    membershipId: uuid("membership_id"),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [
    index("refresh_tokens_family_idx").on(t.familyId),
    index("refresh_tokens_subject_idx").on(t.subjectType, t.subjectId),
  ],
);

/** Tokens de un solo uso: recuperación de contraseña y verificación de email (solo hash). */
export const userTokens = pgTable(
  "user_tokens",
  {
    id: uuidV7Pk(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    kind: text("kind").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("user_tokens_user_kind_idx").on(t.userId, t.kind)],
);
