/**
 * COMPOSICIÓN: el ÚNICO sitio que conoce a todos los módulos (ARCHITECTURE §3 y §4). Aquí se cablean
 * los puertos entre módulos (cada uno declara lo que necesita; otro lo ofrece) y se registran rutas,
 * suscriptores de eventos y servicios del kernel. Los módulos no se importan entre sí.
 */

import { createAuditModule } from "../modules/audit";
import { createCrmModule } from "../modules/crm";
import { createDataImportModule } from "../modules/data-import";
import { createDeliveryModule } from "../modules/delivery";
import { createFilesModule } from "../modules/files";
import { createIdentityModule, type PasswordHasher } from "../modules/identity";
import { createInsightsModule } from "../modules/insights";
import { createOnboardingModule } from "../modules/onboarding";
import { createTenancyModule } from "../modules/tenancy";
import type { Env } from "../platform/config/env";
import { parseSigningKeys } from "../platform/config/env";
import type { Database } from "../platform/db/database";
import { SubscriberRegistry } from "../platform/events/subscribers";
import { createGuards } from "../platform/http/guards";
import type { Logger } from "../platform/logger";
import { createMailer } from "../platform/mail/mailers";
import {
  type Clock,
  type FileStorage,
  type PlatformPorts,
  type SystemMailer,
  systemClock,
} from "../platform/ports";
import { MemoryFileStorage, S3FileStorage } from "../platform/storage/storage";
import { LocalEntitlements } from "./localEntitlements";

export interface CompositionDeps {
  env: Env;
  logger: Logger;
  database: Database;
  clock?: Clock;
  mailer?: SystemMailer;
  storage?: FileStorage;
  hasher?: PasswordHasher;
}

function createStorage(env: Env, logger: Logger): FileStorage {
  if (env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    return new S3FileStorage({
      endpoint: env.S3_ENDPOINT,
      publicEndpoint: env.S3_PUBLIC_ENDPOINT,
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Las variables S3_* son obligatorias en producción (almacenamiento de archivos)",
    );
  }
  logger.warn("S3 no configurado: los archivos usan almacenamiento EN MEMORIA (solo desarrollo)");
  return new MemoryFileStorage();
}

export function createServices(deps: CompositionDeps) {
  const { env, logger, database } = deps;
  const clock = deps.clock ?? systemClock;
  const mailer =
    deps.mailer ??
    createMailer({
      nodeEnv: env.NODE_ENV,
      smtpUrl: env.SMTP_URL,
      from: env.EMAIL_FROM_SYSTEM,
      logger,
    });
  const storage = deps.storage ?? createStorage(env, logger);
  const cookieSecure = env.NODE_ENV === "production";

  // Los guards necesitan puertos que aún no existen (los aportan identity y tenancy, que a su vez
  // necesitan el guard para registrar rutas). Se rellenan después; los guards los leen en cada petición.
  const ports = {} as PlatformPorts;
  const guard = createGuards({ database, ports });

  const entitlements = new LocalEntitlements();
  const audit = createAuditModule({ database, guard });
  const files = createFilesModule({
    database,
    guard,
    storage,
    audit: audit.logger,
    limit: { limitBytes: () => entitlements.storageLimitBytes() },
  });

  // identity ↔ tenancy: se necesitan mutuamente a través de puertos (nunca importándose).
  let tenancyRef: ReturnType<typeof createTenancyModule> | undefined;
  const identity = createIdentityModule({
    database,
    guard,
    audit: audit.logger,
    mailer,
    clock,
    signingKeys: parseSigningKeys(env.JWT_SIGNING_KEYS),
    accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
    refreshTtlDays: env.REFRESH_TOKEN_TTL_DAYS,
    publicUrl: env.NEXO_PUBLIC_URL,
    cookieSecure,
    tenants: {
      summaries: (tx, ids) => {
        if (!tenancyRef) throw new Error("tenancy no inicializado");
        return tenancyRef.summaries(tx, ids);
      },
    },
    seats: { limitFor: () => entitlements.seatLimit() },
    modules: { activeModules: (tx, tenantId) => entitlements.activeModules(tx, tenantId) },
    ...(deps.hasher ? { hasher: deps.hasher } : {}),
  });

  const tenancy = createTenancyModule({
    database,
    guard,
    audit: audit.logger,
    clock,
    owners: identity.owners,
    sessions: identity.sessions,
    members: identity.members,
    cookieSecure,
  });
  tenancyRef = tenancy;

  Object.assign(ports, {
    clock,
    audit: audit.logger,
    mailer,
    files: storage,
    tokens: identity.tokens,
    permissions: identity.permissions,
    tenantGate: tenancy.gate,
    entitlements,
  } satisfies PlatformPorts);

  const crm = createCrmModule({
    database,
    guard,
    members: identity.directory,
    audit: audit.logger,
    clock,
  });

  const delivery = createDeliveryModule({
    database,
    guard,
    members: identity.directory,
    audit: audit.logger,
    clock,
  });
  const insights = createInsightsModule({ database, guard, clock });
  const onboarding = createOnboardingModule({ database, guard, clock });
  // El adaptador del CRM cumple por estructura el puerto `ImportTarget` de data-import.
  const dataImport = createDataImportModule({
    database,
    guard,
    target: crm.importTarget,
    audit: audit.logger,
    clock,
    logger,
  });

  const registry = new SubscriberRegistry();
  for (const s of identity.subscribers) registry.register(s);
  for (const s of crm.subscribers) registry.register(s);
  for (const s of insights.subscribers) registry.register(s);
  for (const s of delivery.subscribers) registry.register(s);
  for (const s of onboarding.subscribers) registry.register(s);

  return {
    env,
    logger,
    database,
    clock,
    mailer,
    storage,
    guard,
    ports,
    entitlements,
    audit,
    files,
    identity,
    tenancy,
    crm,
    insights,
    delivery,
    onboarding,
    dataImport,
    registry,
    /** Registra las rutas de todos los módulos en una app Fastify ya construida. */
    registerRoutes(app: Parameters<typeof tenancy.registerRoutes>[0]) {
      audit.registerRoutes(app);
      tenancy.registerRoutes(app);
      identity.registerRoutes(app);
      files.registerRoutes(app);
      crm.registerRoutes(app);
      insights.registerRoutes(app);
      delivery.registerRoutes(app);
      onboarding.registerRoutes(app);
      dataImport.registerRoutes(app);
    },
  };
}

export type Services = ReturnType<typeof createServices>;
