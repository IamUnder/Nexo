import type {
  AccountDto,
  ActivityDto,
  ContactDto,
  DealDto,
  PipelineDto,
  SearchResult,
  TaskDto,
} from "@nexo/contracts";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client";

/** Claves de caché del CRM. Invalidar `crm.all` refresca todo el módulo tras una mutación. */
export const crm = {
  all: ["crm"] as const,
  accounts: (search: string) => ["crm", "accounts", search] as const,
  account: (id: string) => ["crm", "account", id] as const,
  contacts: (search: string, accountId?: string) =>
    ["crm", "contacts", search, accountId ?? ""] as const,
  pipelines: ["crm", "pipelines"] as const,
  deals: (pipelineId: string, search: string) => ["crm", "deals", pipelineId, search] as const,
  dealsOf: (accountId: string) => ["crm", "deals-of", accountId] as const,
  deal: (id: string) => ["crm", "deal", id] as const,
  activities: (key: string) => ["crm", "activities", key] as const,
  tasks: (key: string) => ["crm", "tasks", key] as const,
  search: (q: string) => ["crm", "search", q] as const,
};

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};

function useCursorList<T>(
  key: readonly unknown[],
  path: string,
  params: Record<string, string | undefined>,
) {
  return useInfiniteQuery({
    queryKey: key,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<CursorPage<T>>(`${path}${qs({ ...params, limit: 25, cursor: pageParam })}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export const useAccounts = (search: string) =>
  useCursorList<AccountDto>(crm.accounts(search), "/crm/accounts", { search });

/** Hasta 100 empresas para los selectores (suficiente para pymes; los listados paginan). */
export const useAccountOptions = () =>
  useQuery({
    queryKey: ["crm", "account-options"],
    queryFn: () => api<CursorPage<AccountDto>>("/crm/accounts?limit=100"),
    select: (p) => p.items,
  });

export const useAccount = (id: string) =>
  useQuery({ queryKey: crm.account(id), queryFn: () => api<AccountDto>(`/crm/accounts/${id}`) });

export const useContacts = (search: string, accountId?: string) =>
  useCursorList<ContactDto>(crm.contacts(search, accountId), "/crm/contacts", {
    search,
    accountId,
  });

export const usePipelines = () =>
  useQuery({ queryKey: crm.pipelines, queryFn: () => api<PipelineDto[]>("/crm/pipelines") });

export const useDeals = (pipelineId: string | undefined, search: string) =>
  useQuery({
    queryKey: crm.deals(pipelineId ?? "", search),
    queryFn: () => api<DealDto[]>(`/crm/deals${qs({ pipelineId, search, limit: 500 })}`),
    enabled: !!pipelineId,
  });

export const useAccountDeals = (accountId: string) =>
  useQuery({
    queryKey: crm.dealsOf(accountId),
    queryFn: () => api<DealDto[]>(`/crm/deals${qs({ accountId })}`),
  });

export const useDeal = (id: string) =>
  useQuery({ queryKey: crm.deal(id), queryFn: () => api<DealDto>(`/crm/deals/${id}`) });

export const useActivities = (filter: {
  accountId?: string;
  dealId?: string;
  contactId?: string;
}) =>
  useQuery({
    queryKey: crm.activities(JSON.stringify(filter)),
    queryFn: () => api<ActivityDto[]>(`/crm/activities${qs({ ...filter, limit: 100 })}`),
  });

export const useTasks = (filter: {
  status?: "open" | "done";
  dealId?: string;
  accountId?: string;
}) =>
  useQuery({
    queryKey: crm.tasks(JSON.stringify(filter)),
    queryFn: () => api<TaskDto[]>(`/crm/tasks${qs({ ...filter, assignee: "me" })}`),
  });

export const useCrmSearch = (q: string) =>
  useQuery({
    queryKey: crm.search(q),
    queryFn: () => api<SearchResult[]>(`/crm/search${qs({ q })}`),
    enabled: q.trim().length >= 2,
  });

// ── Utilidades de presentación ──────────────────────────────────────────────────────────────────
export const money = (cents: number, currency: string, locale: string) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);

/** «12,5» o «12.5» → céntimos. `null` si no es un importe válido. */
export function parseAmountToCents(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return 0;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

/** Fecha `YYYY-MM-DD` de un `<input type="date">` → ISO a las 09:00 locales. */
export const dateToIso = (d: string) => new Date(`${d}T09:00:00`).toISOString();
export const isoToDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

/** Quita claves vacías: la API usa `exactOptionalPropertyTypes` y rechaza cadenas vacías opcionales. */
export function clean<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== ""),
  ) as Partial<T>;
}

export const useSampleStatus = (enabled: boolean) =>
  useQuery({
    queryKey: ["crm", "sample-data"],
    queryFn: () => api<{ loaded: boolean }>("/crm/sample-data"),
    enabled,
  });
