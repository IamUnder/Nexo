import type { Database } from "../../../platform/db/database";
import { AppError } from "../../../platform/errors";
import type { TenantContext } from "../../../platform/tenant/context";
import type { AccountService } from "./accountService";
import type { ActivityService } from "./activityService";
import type { ContactService } from "./contactService";
import type { DealService } from "./dealService";
import type { PipelineService } from "./pipelineService";
import type { CrmRepository } from "./ports";

/** Marca de las empresas de ejemplo: permite quitarlas sin tocar datos reales. */
export const SAMPLE_SOURCE = "sample";

const ALL = { scope: "all" as const };
const DAY = 86_400_000;

interface SampleAccount {
  name: string;
  domain: string;
  industry: string;
  status: "prospect" | "active";
  contacts: Array<{ first: string; last: string; job: string }>;
  deals: Array<{
    name: string;
    amount: number;
    /** Etapa destino por nombre de etapa abierta, `won` o `lost`. */
    outcome: string;
    nextAction: string;
    inDays: number;
    lostReason?: string;
  }>;
}

/** Datos de ejemplo de una pyme de servicios B2B (plantilla `professional_services`). */
const ACCOUNTS: SampleAccount[] = [
  {
    name: "Aurora Logística",
    domain: "auroralogistica.example",
    industry: "Logística",
    status: "active",
    contacts: [
      { first: "Marta", last: "Salgado", job: "Directora de operaciones" },
      { first: "Íñigo", last: "Pastor", job: "Responsable de compras" },
    ],
    deals: [
      {
        name: "Auditoría de procesos",
        amount: 1_800_000,
        outcome: "won",
        nextAction: "Kickoff",
        inDays: 0,
      },
      {
        name: "Mantenimiento anual",
        amount: 960_000,
        outcome: "Negociación",
        nextAction: "Cerrar condiciones del contrato",
        inDays: 2,
      },
    ],
  },
  {
    name: "Bodegas Valdeolmos",
    domain: "valdeolmos.example",
    industry: "Alimentación y bebidas",
    status: "prospect",
    contacts: [{ first: "Raúl", last: "Cifuentes", job: "Gerente" }],
    deals: [
      {
        name: "Tienda online y logística",
        amount: 2_400_000,
        outcome: "Propuesta",
        nextAction: "Presentar la propuesta al comité",
        inDays: 4,
      },
    ],
  },
  {
    name: "Clínica Dental Norte",
    domain: "clinicanorte.example",
    industry: "Salud",
    status: "prospect",
    contacts: [{ first: "Lucía", last: "Barrientos", job: "Directora" }],
    deals: [
      {
        name: "Web y reservas online",
        amount: 780_000,
        outcome: "Cualificado",
        nextAction: "Reunión de descubrimiento",
        inDays: 1,
      },
    ],
  },
  {
    name: "Estudio Mediterráneo",
    domain: "estudiomed.example",
    industry: "Arquitectura",
    status: "active",
    contacts: [
      { first: "Jaume", last: "Ferrer", job: "Socio fundador" },
      { first: "Nuria", last: "Casals", job: "Administración" },
    ],
    deals: [
      {
        name: "Rediseño de marca",
        amount: 1_250_000,
        outcome: "won",
        nextAction: "Entrega de manual",
        inDays: 0,
      },
      {
        name: "Intranet de proyectos",
        amount: 1_900_000,
        outcome: "Propuesta",
        nextAction: "Resolver dudas técnicas",
        inDays: -1,
      },
    ],
  },
  {
    name: "Ferretería Industrial Gómez",
    domain: "ferregomez.example",
    industry: "Industria",
    status: "prospect",
    contacts: [{ first: "Pablo", last: "Gómez", job: "Propietario" }],
    deals: [
      {
        name: "ERP ligero",
        amount: 3_200_000,
        outcome: "lost",
        nextAction: "—",
        inDays: 0,
        lostReason: "Eligió una solución más barata",
      },
    ],
  },
  {
    name: "Grupo Quirós Asesores",
    domain: "quirosasesores.example",
    industry: "Asesoría",
    status: "prospect",
    contacts: [{ first: "Elena", last: "Quirós", job: "Socia directora" }],
    deals: [
      {
        name: "Portal de clientes",
        amount: 1_450_000,
        outcome: "Prospecto",
        nextAction: "Enviar caso de éxito",
        inDays: 3,
      },
    ],
  },
  {
    name: "Hotel Mirador del Valle",
    domain: "miradorvalle.example",
    industry: "Turismo",
    status: "prospect",
    contacts: [{ first: "Sergio", last: "Montoya", job: "Director comercial" }],
    deals: [
      {
        name: "Motor de reservas directas",
        amount: 2_100_000,
        outcome: "Negociación",
        nextAction: "Llamar para cerrar presupuesto",
        inDays: -3,
      },
    ],
  },
  {
    name: "Innova Packaging",
    domain: "innovapack.example",
    industry: "Industria",
    status: "prospect",
    contacts: [{ first: "Carmen", last: "Ortuño", job: "Directora financiera" }],
    deals: [
      {
        name: "Cuadros de mando financieros",
        amount: 1_100_000,
        outcome: "Cualificado",
        nextAction: "Recoger requisitos",
        inDays: 6,
      },
    ],
  },
];

/**
 * Datos de ejemplo para ver el CRM «vivo» desde el minuto 0 (MODULES_SPEC §8: «datos de ejemplo»).
 * Se crean con los casos de uso reales (eventos, timeline y panel incluidos) y las empresas llevan
 * `source = "sample"`, de modo que se pueden quitar sin tocar nada real.
 */
export class SampleDataService {
  constructor(
    private readonly d: {
      database: Database;
      repo: CrmRepository;
      accounts: AccountService;
      contacts: ContactService;
      deals: DealService;
      activities: ActivityService;
      pipelines: PipelineService;
      clock: { now(): Date };
    },
  ) {}

  async status(ctx: TenantContext): Promise<{ loaded: boolean }> {
    const ids = await this.d.database.withTenant(ctx, (tx) => this.d.repo.sampleAccountIds(tx));
    return { loaded: ids.length > 0 };
  }

  async load(ctx: TenantContext): Promise<{ accounts: number; contacts: number; deals: number }> {
    if ((await this.status(ctx)).loaded) {
      throw new AppError("crm.sample_exists", 409, "Los datos de ejemplo ya están cargados");
    }
    const pipeline =
      (await this.d.pipelines.list(ctx)).find((p) => p.isDefault) ??
      (await this.d.pipelines.list(ctx))[0];
    if (!pipeline) throw new AppError("resource.not_found", 404, "No hay pipeline");
    const stage = (name: string) => pipeline.stages.find((s) => s.name === name)?.id;

    let contacts = 0;
    let deals = 0;
    const now = this.d.clock.now().getTime();
    for (const a of ACCOUNTS) {
      const account = await this.d.accounts.create(ctx, ALL, {
        name: a.name,
        domain: a.domain,
        industry: a.industry,
        status: a.status,
        source: SAMPLE_SOURCE,
      });
      const created: string[] = [];
      for (const c of a.contacts) {
        const email = `${c.first}.${c.last}@${a.domain}`
          .toLowerCase()
          .normalize("NFD")
          .replace(/\p{Diacritic}/gu, "");
        const contact = await this.d.contacts.create(ctx, ALL, {
          accountId: account.id,
          firstName: c.first,
          lastName: c.last,
          jobTitle: c.job,
          email,
          status: "active",
        });
        created.push(contact.id);
        contacts++;
      }
      for (const deal of a.deals) {
        const target = stage(deal.outcome);
        const when = new Date(now + deal.inDays * DAY).toISOString();
        const d = await this.d.deals.create(ctx, ALL, {
          name: deal.name,
          accountId: account.id,
          ...(created[0] ? { primaryContactId: created[0] } : {}),
          amountCents: deal.amount,
          expectedCloseOn: new Date(now + 21 * DAY).toISOString().slice(0, 10),
          nextActionText: deal.nextAction,
          nextActionAt: when,
        });
        deals++;
        if (deal.outcome === "won") await this.d.deals.win(ctx, ALL, d.id);
        else if (deal.outcome === "lost")
          await this.d.deals.lose(ctx, ALL, d.id, deal.lostReason ?? "Sin motivo");
        else if (target && deal.outcome !== "Prospecto")
          await this.d.deals.move(ctx, ALL, d.id, target);
        await this.d.activities.create(ctx, ALL, {
          kind: "note",
          subject: "Primer contacto",
          body: "Datos de ejemplo: así se ve el seguimiento de una oportunidad.",
          dealId: d.id,
        });
        if (deal.outcome !== "won" && deal.outcome !== "lost") {
          await this.d.activities.createTask(ctx, ALL, {
            title: deal.nextAction,
            dueAt: when,
            priority: deal.inDays < 0 ? "high" : "normal",
            dealId: d.id,
          });
        }
      }
    }
    return { accounts: ACCOUNTS.length, contacts, deals };
  }

  /** Quita SOLO lo de ejemplo, con los casos de uso reales (así Insights se entera por eventos). */
  async remove(ctx: TenantContext): Promise<{ accounts: number }> {
    const ids = await this.d.database.withTenant(ctx, (tx) => this.d.repo.sampleAccountIds(tx));
    for (const accountId of ids) {
      const deals = await this.d.deals.list(ctx, ALL, { accountId, limit: 500 });
      for (const deal of deals) {
        const tasks = await this.d.activities.listTasks(ctx, ALL, {
          assignee: "all",
          dealId: deal.id,
          limit: 200,
        });
        for (const task of tasks) await this.d.activities.deleteTask(ctx, ALL, task.id);
        await this.d.deals.delete(ctx, ALL, deal.id);
      }
      const contacts = await this.d.contacts.list(ctx, ALL, { accountId, limit: 100 });
      for (const contact of contacts.items) await this.d.contacts.delete(ctx, ALL, contact.id);
      await this.d.accounts.delete(ctx, ALL, accountId);
    }
    return { accounts: ids.length };
  }
}
