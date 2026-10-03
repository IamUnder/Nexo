import { zodResolver } from "@hookform/resolvers/zod";
import type { AdminTenantDto, Page } from "@nexo/contracts";
import {
  Alert,
  Badge,
  type BadgeTone,
  Button,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
  Select,
  Skeleton,
  Table,
  Td,
  THead,
  Th,
  Tr,
  useToast,
} from "@nexo/ui";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";

const STATUSES = ["trial", "active", "past_due", "suspended", "cancelled"] as const;
const TONE: Record<string, BadgeTone> = {
  trial: "info",
  active: "success",
  past_due: "warning",
  suspended: "error",
  cancelled: "error",
  trial_expired: "error",
};

const ADMIN_TENANTS = ["admin", "tenants"] as const;

/** Búsqueda con retraso: no lanza una petición por pulsación de tecla. */
function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function CreateTenantDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation();
  const { t: ta } = useTranslation("auth");
  const toast = useToast();
  const queryClient = useQueryClient();
  const schema = useMemo(
    () =>
      z.object({
        companyName: z.string().trim().min(2, ta("validation.required")),
        ownerFullName: z.string().trim().min(2, ta("validation.required")),
        ownerEmail: z
          .string()
          .trim()
          .min(1, ta("validation.required"))
          .email(ta("validation.email")),
        billingMode: z.enum(["manual", "stripe"]),
        trialDays: z.coerce.number().int().min(0).max(365),
      }),
    [ta],
  );
  type Values = z.input<typeof schema>;
  const form = useForm<Values, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: {
      companyName: "",
      ownerFullName: "",
      ownerEmail: "",
      billingMode: "manual",
      trialDays: 21,
    },
  });
  const create = useMutation({
    mutationFn: (v: z.output<typeof schema>) =>
      api<AdminTenantDto>("/admin/tenants", { method: "POST", body: v, scope: "admin" }),
    onSuccess: async () => {
      toast.show(t("create.created"));
      await queryClient.invalidateQueries({ queryKey: ADMIN_TENANTS });
      form.reset();
      onOpenChange(false);
    },
  });
  const e = form.formState.errors;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("create.title")}
      description={t("create.description")}
      closeLabel={tc("actions.close")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc("actions.cancel")}
          </Button>
          <Button type="submit" form="create-tenant" loading={create.isPending}>
            {t("create.submit")}
          </Button>
        </>
      }
    >
      <form
        id="create-tenant"
        noValidate
        onSubmit={form.handleSubmit((v) => create.mutate(v))}
        className="flex flex-col gap-4"
      >
        {create.isError ? <Alert tone="error">{errorMessage(tc, create.error)}</Alert> : null}
        <Field label={t("create.company")} error={e.companyName?.message} required>
          {(p) => <Input autoFocus {...p} {...form.register("companyName")} />}
        </Field>
        <Field label={t("create.ownerName")} error={e.ownerFullName?.message} required>
          {(p) => <Input {...p} {...form.register("ownerFullName")} />}
        </Field>
        <Field label={t("create.ownerEmail")} error={e.ownerEmail?.message} required>
          {(p) => <Input type="email" {...p} {...form.register("ownerEmail")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("create.billing")}>
            {(p) => (
              <Select {...p} {...form.register("billingMode")}>
                <option value="manual">{t("create.billingManual")}</option>
                <option value="stripe">{t("create.billingStripe")}</option>
              </Select>
            )}
          </Field>
          <Field
            label={t("create.trial")}
            hint={t("create.trialHint")}
            error={e.trialDays?.message}
          >
            {(p) => (
              <Input
                type="number"
                min={0}
                max={365}
                inputMode="numeric"
                {...p}
                {...form.register("trialDays")}
              />
            )}
          </Field>
        </div>
      </form>
    </Dialog>
  );
}

function TenantDetailDialog({
  tenant,
  onClose,
}: {
  tenant: AdminTenantDto | null;
  onClose: () => void;
}) {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string>("");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("14");
  const [extReason, setExtReason] = useState("");

  const key = tenant?.id ?? "";
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setStatus(tenant?.status ?? "");
    setReason("");
    setExtReason("");
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ADMIN_TENANTS });
  const change = useMutation({
    mutationFn: () =>
      api<AdminTenantDto>(`/admin/tenants/${tenant?.id}/status`, {
        method: "PATCH",
        scope: "admin",
        body: { status, reason },
      }),
    onSuccess: async () => {
      toast.show(t("detail.statusChanged"));
      await refresh();
      onClose();
    },
  });
  const extend = useMutation({
    mutationFn: () =>
      api<AdminTenantDto>(`/admin/tenants/${tenant?.id}/extend-trial`, {
        method: "POST",
        scope: "admin",
        body: { days: Number(days), reason: extReason },
      }),
    onSuccess: async () => {
      toast.show(t("detail.trialExtended"));
      await refresh();
      onClose();
    },
  });

  const canChange = status !== tenant?.status && reason.trim().length >= 3;
  const canExtend = tenant?.status === "trial" && Number(days) >= 1 && extReason.trim().length >= 3;

  return (
    <Dialog
      open={tenant !== null}
      onOpenChange={(o) => !o && onClose()}
      title={tenant?.name ?? t("detail.title")}
      description={
        tenant ? `${tenant.slug} · ${tc(`status.${tenant.effectiveStatus}`)}` : undefined
      }
      closeLabel={tc("actions.close")}
    >
      {tenant ? (
        <div className="flex flex-col gap-6">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-secondary">{t("detail.billingMode")}</dt>
              <dd className="font-medium">{tenant.billingMode}</dd>
            </div>
            <div>
              <dt className="text-secondary">{t("detail.country")}</dt>
              <dd className="font-medium">{tenant.country ?? "—"}</dd>
            </div>
            {tenant.trialEndsAt ? (
              <div>
                <dt className="text-secondary">{t("detail.trialEnds")}</dt>
                <dd className="font-medium">
                  {new Date(tenant.trialEndsAt).toLocaleDateString(tenant.locale, {
                    dateStyle: "long",
                  })}
                </dd>
              </div>
            ) : null}
          </dl>

          <section aria-labelledby="chg" className="flex flex-col gap-3">
            <h3 id="chg" className="font-display text-base font-semibold">
              {t("detail.changeStatus")}
            </h3>
            {change.isError ? <Alert tone="error">{errorMessage(tc, change.error)}</Alert> : null}
            <Field label={t("detail.newStatus")}>
              {(p) => (
                <Select {...p} value={status} onChange={(e) => setStatus(e.target.value)}>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {tc(`status.${s}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t("detail.reason")} required>
              {(p) => <Input {...p} value={reason} onChange={(e) => setReason(e.target.value)} />}
            </Field>
            <div>
              <Button
                loading={change.isPending}
                disabled={!canChange}
                onClick={() => change.mutate()}
              >
                {t("detail.applyStatus")}
              </Button>
            </div>
          </section>

          {tenant.status === "trial" ? (
            <section aria-labelledby="ext" className="flex flex-col gap-3">
              <h3 id="ext" className="font-display text-base font-semibold">
                {t("detail.extendTrial")}
              </h3>
              {extend.isError ? <Alert tone="error">{errorMessage(tc, extend.error)}</Alert> : null}
              <Field label={t("detail.days")}>
                {(p) => (
                  <Input
                    type="number"
                    min={1}
                    max={180}
                    inputMode="numeric"
                    {...p}
                    value={days}
                    onChange={(e) => setDays(e.target.value)}
                  />
                )}
              </Field>
              <Field label={t("detail.reason")} required>
                {(p) => (
                  <Input {...p} value={extReason} onChange={(e) => setExtReason(e.target.value)} />
                )}
              </Field>
              <div>
                <Button
                  variant="secondary"
                  loading={extend.isPending}
                  disabled={!canExtend}
                  onClick={() => extend.mutate()}
                >
                  {t("detail.applyExtend")}
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}

export function AdminTenantsPage() {
  const { t } = useTranslation("admin");
  const { t: tc } = useTranslation();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AdminTenantDto | null>(null);
  const q = useDebounced(search.trim());

  const list = useInfiniteQuery({
    queryKey: [...ADMIN_TENANTS, q, status],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: "25" });
      if (pageParam) params.set("cursor", pageParam);
      if (q) params.set("search", q);
      if (status) params.set("status", status);
      return api<Page<AdminTenantDto>>(`/admin/tenants?${params}`, { scope: "admin" });
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[32px] leading-10 font-bold">{t("tenants.title")}</h1>
          <p className="text-secondary mt-1 max-w-2xl text-base">{t("tenants.subtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Icon name="plus" />
          {t("tenants.new")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-64 flex-1">
          <Icon
            name="search"
            size={16}
            className="text-secondary pointer-events-none absolute top-3 left-3"
          />
          <Input
            type="search"
            aria-label={t("tenants.search")}
            placeholder={t("tenants.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          aria-label={t("tenants.status")}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-52"
        >
          <option value="">{t("tenants.allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tc(`status.${s}`)}
            </option>
          ))}
        </Select>
      </div>

      {list.isLoading ? <Skeleton className="h-64" /> : null}
      {list.isError ? <Alert tone="error">{errorMessage(tc, list.error)}</Alert> : null}
      {list.isSuccess && rows.length === 0 ? (
        <EmptyState
          icon="building"
          title={t("tenants.empty")}
          description={t("tenants.emptyHint")}
        />
      ) : null}
      {rows.length > 0 ? (
        <>
          <Table label={t("tenants.table")}>
            <THead>
              <Tr>
                <Th>{t("tenants.name")}</Th>
                <Th>{t("tenants.status")}</Th>
                <Th className="hidden md:table-cell">{t("tenants.origin")}</Th>
                <Th className="text-right">{t("tenants.members")}</Th>
                <Th className="hidden lg:table-cell">{t("tenants.created")}</Th>
              </Tr>
            </THead>
            <tbody>
              {rows.map((tn) => (
                <Tr key={tn.id}>
                  <Td>
                    <button
                      type="button"
                      onClick={() => setSelected(tn)}
                      className="text-left font-medium underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus"
                    >
                      {tn.name}
                    </button>
                    <div className="text-secondary text-xs">{tn.slug}</div>
                  </Td>
                  <Td>
                    <Badge tone={TONE[tn.effectiveStatus] ?? "neutral"}>
                      {tc(`status.${tn.effectiveStatus}`)}
                    </Badge>
                  </Td>
                  <Td className="text-secondary hidden md:table-cell">
                    {t(`tenants.origin_${tn.origin}`, { defaultValue: tn.origin })}
                  </Td>
                  <Td numeric>{tn.memberCount}</Td>
                  <Td className="text-secondary hidden lg:table-cell">
                    {new Date(tn.createdAt).toLocaleDateString(tn.locale)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {list.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                loading={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {t("tenants.loadMore")}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      <CreateTenantDialog open={creating} onOpenChange={setCreating} />
      <TenantDetailDialog tenant={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
