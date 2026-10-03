import { zodResolver } from "@hookform/resolvers/zod";
import {
  ACCOUNT_STATUSES,
  ACTIVITY_KINDS,
  type AccountDto,
  type ActivityDto,
  type DealDto,
  TASK_PRIORITIES,
  type TaskDto,
} from "@nexo/contracts";
import {
  Alert,
  Badge,
  type BadgeTone,
  Button,
  Dialog,
  Field,
  Icon,
  Input,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@nexo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { useMe } from "../../shared/api/queries";
import {
  clean,
  crm,
  dateToIso,
  money,
  parseAmountToCents,
  useAccountOptions,
  useActivities,
} from "./api";

export function useLocale() {
  const { data: me } = useMe();
  return me?.tenant.locale ?? "es-ES";
}

export function useFormatters() {
  const locale = useLocale();
  return {
    money: (cents: number, currency = "EUR") => money(cents, currency, locale),
    date: (iso: string | null) =>
      iso ? new Date(iso).toLocaleDateString(locale, { dateStyle: "medium" }) : null,
    dateTime: (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
        : null,
  };
}

export const STATUS_TONE: Record<string, BadgeTone> = {
  open: "info",
  won: "success",
  lost: "error",
  prospect: "neutral",
  active: "success",
  at_risk: "warning",
  inactive: "neutral",
};

/** ¿Está vencida la fecha (sin hora)? Una fecha de hoy no cuenta como vencida. */
export const isOverdue = (iso: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
  return end <= Date.now();
};

function useInvalidateCrm() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: crm.all });
}

export function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
      <Skeleton className="h-12" />
    </div>
  );
}

// ── Crear / editar empresa ─────────────────────────────────────────────────────────────────────
export function AccountDialog({
  open,
  onOpenChange,
  account,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  account?: AccountDto | undefined;
  onSaved?: ((a: { id: string }) => void) | undefined;
}) {
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateCrm();
  const editing = !!account;
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(2, tc("errors:validation.failed")).max(160),
        legalName: z.string().trim().max(200),
        taxId: z.string().trim().max(40),
        domain: z.string().trim().max(120),
        industry: z.string().trim().max(80),
        phone: z.string().trim().max(40),
        status: z.enum(ACCOUNT_STATUSES),
        notes: z.string().trim().max(4000),
      }),
    [tc],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: account?.name ?? "",
      legalName: account?.legalName ?? "",
      taxId: account?.taxId ?? "",
      domain: account?.domain ?? "",
      industry: account?.industry ?? "",
      phone: account?.phone ?? "",
      status: (account?.status as Values["status"]) ?? "prospect",
      notes: account?.notes ?? "",
    },
  });

  const save = useMutation({
    mutationFn: (v: Values) =>
      editing
        ? api<AccountDto>(`/crm/accounts/${account.id}`, { method: "PATCH", body: v })
        : api<AccountDto>("/crm/accounts", { method: "POST", body: clean(v) }),
    onSuccess: async (saved) => {
      toast.show(editing ? t("accounts.saved") : t("accounts.created"));
      await invalidate();
      if (!editing) form.reset();
      onOpenChange(false);
      onSaved?.(saved);
    },
  });

  const formId = "account-form";
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? t("accounts.form.nameEdit") : t("accounts.form.nameCreate")}
      closeLabel={tc("actions.close")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc("actions.cancel")}
          </Button>
          <Button type="submit" form={formId} loading={save.isPending}>
            {editing ? t("accounts.form.submitEdit") : t("accounts.form.submitCreate")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="flex flex-col gap-4"
      >
        {save.isError ? <Alert tone="error">{errorMessage(tc, save.error)}</Alert> : null}
        <Field label={t("accounts.form.name")} error={form.formState.errors.name?.message} required>
          {(p) => <Input autoFocus {...p} {...form.register("name")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("accounts.form.legalName")}>
            {(p) => <Input {...p} {...form.register("legalName")} />}
          </Field>
          <Field label={t("accounts.form.taxId")}>
            {(p) => <Input {...p} {...form.register("taxId")} />}
          </Field>
          <Field label={t("accounts.form.domain")}>
            {(p) => <Input placeholder="empresa.es" {...p} {...form.register("domain")} />}
          </Field>
          <Field label={t("accounts.form.industry")}>
            {(p) => <Input {...p} {...form.register("industry")} />}
          </Field>
          <Field label={t("accounts.form.phone")}>
            {(p) => <Input type="tel" {...p} {...form.register("phone")} />}
          </Field>
          <Field label={t("accounts.form.status")}>
            {(p) => (
              <Select {...p} {...form.register("status")}>
                {ACCOUNT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`accounts.status.${s}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label={t("accounts.form.notes")}>
          {(p) => <Textarea rows={3} {...p} {...form.register("notes")} />}
        </Field>
      </form>
    </Dialog>
  );
}

// ── Crear contacto ─────────────────────────────────────────────────────────────────────────────
export function ContactDialog({
  open,
  onOpenChange,
  accountId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Si se indica, el contacto nace vinculado a esa empresa y no se muestra el selector. */
  accountId?: string | undefined;
}) {
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateCrm();
  const accounts = useAccountOptions();
  const schema = useMemo(
    () =>
      z.object({
        firstName: z.string().trim().min(1, tc("errors:validation.failed")).max(100),
        lastName: z.string().trim().max(100),
        email: z.union([z.literal(""), z.string().trim().email(tc("errors:validation.failed"))]),
        phone: z.string().trim().max(40),
        jobTitle: z.string().trim().max(100),
        accountId: z.string(),
      }),
    [tc],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      jobTitle: "",
      accountId: accountId ?? "",
    },
  });
  const save = useMutation({
    mutationFn: (v: Values) => api("/crm/contacts", { method: "POST", body: clean(v) }),
    onSuccess: async () => {
      toast.show(t("contacts.created"));
      await invalidate();
      form.reset();
      onOpenChange(false);
    },
  });
  const formId = "contact-form";
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("contacts.form.title")}
      closeLabel={tc("actions.close")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc("actions.cancel")}
          </Button>
          <Button type="submit" form={formId} loading={save.isPending}>
            {t("contacts.form.submit")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="flex flex-col gap-4"
      >
        {save.isError ? <Alert tone="error">{errorMessage(tc, save.error)}</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("contacts.form.firstName")}
            error={form.formState.errors.firstName?.message}
            required
          >
            {(p) => <Input autoFocus {...p} {...form.register("firstName")} />}
          </Field>
          <Field label={t("contacts.form.lastName")}>
            {(p) => <Input {...p} {...form.register("lastName")} />}
          </Field>
        </div>
        <Field label={t("contacts.form.email")} error={form.formState.errors.email?.message}>
          {(p) => <Input type="email" {...p} {...form.register("email")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("contacts.form.phone")}>
            {(p) => <Input type="tel" {...p} {...form.register("phone")} />}
          </Field>
          <Field label={t("contacts.form.jobTitle")}>
            {(p) => <Input {...p} {...form.register("jobTitle")} />}
          </Field>
        </div>
        {accountId ? null : (
          <Field label={t("contacts.form.account")}>
            {(p) => (
              <Select {...p} {...form.register("accountId")}>
                <option value="">{t("contacts.form.noAccount")}</option>
                {accounts.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </form>
    </Dialog>
  );
}

// ── Crear oportunidad ──────────────────────────────────────────────────────────────────────────
export function DealDialog({
  open,
  onOpenChange,
  accountId,
  pipelineId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accountId?: string | undefined;
  pipelineId?: string | undefined;
}) {
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const invalidate = useInvalidateCrm();
  const accounts = useAccountOptions();
  const required = tc("errors:validation.failed");
  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(2, required).max(160),
          accountId: z.string().min(1, required),
          amount: z.string().refine((v) => parseAmountToCents(v) !== null, required),
          expectedCloseOn: z.string(),
          nextActionText: z.string().trim().max(200),
          nextActionAt: z.string(),
        })
        .refine((v) => v.nextActionText !== "" || v.nextActionAt !== "", {
          path: ["nextActionText"],
          message: t("deals.create.nextActionRequired"),
        }),
    [required, t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: "",
      accountId: accountId ?? "",
      amount: "",
      expectedCloseOn: "",
      nextActionText: "",
      nextActionAt: "",
    },
  });
  const save = useMutation({
    mutationFn: (v: Values) =>
      api<DealDto>("/crm/deals", {
        method: "POST",
        body: clean({
          name: v.name,
          accountId: v.accountId,
          pipelineId,
          amountCents: parseAmountToCents(v.amount) ?? 0,
          expectedCloseOn: v.expectedCloseOn,
          nextActionText: v.nextActionText,
          nextActionAt: v.nextActionAt ? dateToIso(v.nextActionAt) : undefined,
        }),
      }),
    onSuccess: async (deal) => {
      toast.show(t("deals.create.title"));
      await invalidate();
      form.reset();
      onOpenChange(false);
      void navigate({ to: "/crm/deals/$dealId", params: { dealId: deal.id } });
    },
  });
  const formId = "deal-form";
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("deals.create.title")}
      closeLabel={tc("actions.close")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc("actions.cancel")}
          </Button>
          <Button type="submit" form={formId} loading={save.isPending}>
            {t("deals.create.submit")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="flex flex-col gap-4"
      >
        {save.isError ? <Alert tone="error">{errorMessage(tc, save.error)}</Alert> : null}
        {accounts.data?.length === 0 && !accountId ? (
          <Alert tone="info">{t("deals.noAccounts")}</Alert>
        ) : null}
        <Field label={t("deals.create.name")} error={form.formState.errors.name?.message} required>
          {(p) => <Input autoFocus {...p} {...form.register("name")} />}
        </Field>
        {accountId ? null : (
          <Field
            label={t("deals.create.account")}
            error={form.formState.errors.accountId?.message}
            required
          >
            {(p) => (
              <Select {...p} {...form.register("accountId")}>
                <option value="">{t("deals.create.accountPlaceholder")}</option>
                {accounts.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("deals.create.amount")} error={form.formState.errors.amount?.message}>
            {(p) => (
              <Input inputMode="decimal" placeholder="0" {...p} {...form.register("amount")} />
            )}
          </Field>
          <Field label={t("deals.create.expectedClose")}>
            {(p) => <Input type="date" {...p} {...form.register("expectedCloseOn")} />}
          </Field>
        </div>
        <fieldset className="border-line flex flex-col gap-4 rounded-control border p-4">
          <legend className="text-secondary px-1 text-sm">
            {t("deals.create.nextActionText")}
          </legend>
          <Field
            label={t("deals.create.nextActionText")}
            hint={t("deals.create.nextActionHint")}
            error={form.formState.errors.nextActionText?.message}
          >
            {(p) => <Input {...p} {...form.register("nextActionText")} />}
          </Field>
          <Field label={t("deals.create.nextActionAt")}>
            {(p) => <Input type="date" {...p} {...form.register("nextActionAt")} />}
          </Field>
        </fieldset>
      </form>
    </Dialog>
  );
}

// ── Perder oportunidad ─────────────────────────────────────────────────────────────────────────
export function LoseDealDialog({
  deal,
  onOpenChange,
}: {
  deal: DealDto | null;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateCrm();
  const schema = useMemo(
    () => z.object({ reason: z.string().trim().min(2, tc("errors:validation.failed")).max(300) }),
    [tc],
  );
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { reason: "" },
  });
  const lose = useMutation({
    mutationFn: (v: { reason: string }) =>
      api(`/crm/deals/${deal?.id}/lose`, { method: "POST", body: v }),
    onSuccess: async () => {
      toast.show(t("deals.lost"));
      await invalidate();
      form.reset();
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={deal !== null}
      onOpenChange={onOpenChange}
      title={t("deals.loseDialog.title")}
      description={t("deals.loseDialog.description")}
      closeLabel={tc("actions.close")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc("actions.cancel")}
          </Button>
          <Button type="submit" form="lose-form" loading={lose.isPending}>
            {t("deals.loseDialog.submit")}
          </Button>
        </>
      }
    >
      <form
        id="lose-form"
        noValidate
        onSubmit={form.handleSubmit((v) => lose.mutate(v))}
        className="flex flex-col gap-4"
      >
        {lose.isError ? <Alert tone="error">{errorMessage(tc, lose.error)}</Alert> : null}
        <Field
          label={t("deals.loseDialog.reason")}
          error={form.formState.errors.reason?.message}
          required
        >
          {(p) => <Textarea rows={3} autoFocus {...p} {...form.register("reason")} />}
        </Field>
      </form>
    </Dialog>
  );
}

/** Mutaciones de cambio de estado de una oportunidad (mover/ganar/reabrir), con aviso y refresco. */
export function useDealActions() {
  const { t } = useTranslation("crm");
  const toast = useToast();
  const invalidate = useInvalidateCrm();
  const run = (path: string, body?: unknown, message?: string) => async () => {
    await api(path, { method: "POST", ...(body ? { body } : {}) });
    if (message) toast.show(message);
    await invalidate();
  };
  return {
    move: useMutation({
      mutationFn: (a: { id: string; stageId: string }) =>
        run(`/crm/deals/${a.id}/move`, { stageId: a.stageId }, t("deals.moved"))(),
    }),
    win: useMutation({
      mutationFn: (id: string) => run(`/crm/deals/${id}/win`, undefined, t("deals.won"))(),
    }),
    reopen: useMutation({
      mutationFn: (id: string) => run(`/crm/deals/${id}/reopen`, undefined, t("deals.reopened"))(),
    }),
  };
}

// ── Timeline de actividad (+ registrar) ────────────────────────────────────────────────────────
const KIND_ICON = {
  note: "file",
  call: "user",
  meeting: "users",
  email: "mail",
  stage_change: "chevron-right",
  system: "info",
} as const;

export function ActivityTimeline({
  filter,
  canCreate,
}: {
  filter: { accountId?: string; dealId?: string; contactId?: string };
  canCreate: boolean;
}) {
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const fmt = useFormatters();
  const toast = useToast();
  const invalidate = useInvalidateCrm();
  const activities = useActivities(filter);
  const schema = useMemo(
    () =>
      z.object({
        kind: z.enum(ACTIVITY_KINDS),
        subject: z.string().trim().min(1, tc("errors:validation.failed")).max(200),
        body: z.string().trim().max(4000),
      }),
    [tc],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { kind: "note", subject: "", body: "" },
  });
  const add = useMutation({
    mutationFn: (v: Values) =>
      api("/crm/activities", { method: "POST", body: clean({ ...v, ...filter }) }),
    onSuccess: async () => {
      toast.show(t("activity.saved"));
      form.reset();
      await invalidate();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {canCreate ? (
        <form
          noValidate
          onSubmit={form.handleSubmit((v) => add.mutate(v))}
          className="bg-surface border-line flex flex-col gap-3 rounded-card border p-4"
          aria-label={t("activity.title")}
        >
          {add.isError ? <Alert tone="error">{errorMessage(tc, add.error)}</Alert> : null}
          <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
            <Field label={t("activity.form.kind")}>
              {(p) => (
                <Select {...p} {...form.register("kind")}>
                  {ACTIVITY_KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t(`activity.kind.${k}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label={t("activity.form.subject")}
              error={form.formState.errors.subject?.message}
              required
            >
              {(p) => <Input {...p} {...form.register("subject")} />}
            </Field>
          </div>
          <Field label={t("activity.form.body")}>
            {(p) => <Textarea rows={2} {...p} {...form.register("body")} />}
          </Field>
          <div>
            <Button type="submit" loading={add.isPending}>
              {t("activity.form.submit")}
            </Button>
          </div>
        </form>
      ) : null}

      {activities.isLoading ? <ListSkeleton /> : null}
      {activities.data?.length === 0 ? (
        <p className="text-secondary text-sm">{t("activity.empty")}</p>
      ) : null}
      <ol className="flex flex-col gap-3" aria-label={t("activity.title")}>
        {activities.data?.map((a: ActivityDto) => (
          <li key={a.id} className="flex gap-3">
            <span className="bg-surface border-line text-secondary mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full border">
              <Icon name={KIND_ICON[a.kind as keyof typeof KIND_ICON] ?? "info"} size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{a.subject}</p>
              {a.body ? (
                <p className="text-secondary text-sm whitespace-pre-wrap">{a.body}</p>
              ) : null}
              <p className="text-secondary mt-0.5 text-xs">
                {t(`activity.kind.${a.kind}`, { defaultValue: a.kind })} ·{" "}
                {fmt.dateTime(a.occurredAt)}
                {a.authorName ? ` · ${a.authorName}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ── Tareas ─────────────────────────────────────────────────────────────────────────────────────
export function TaskDialog({
  open,
  onOpenChange,
  dealId,
  accountId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  dealId?: string | undefined;
  accountId?: string | undefined;
}) {
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const invalidate = useInvalidateCrm();
  const schema = useMemo(
    () =>
      z.object({
        title: z.string().trim().min(1, tc("errors:validation.failed")).max(200),
        dueAt: z.string(),
        priority: z.enum(TASK_PRIORITIES),
      }),
    [tc],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: { title: "", dueAt: "", priority: "normal" },
  });
  const save = useMutation({
    mutationFn: (v: Values) =>
      api("/crm/tasks", {
        method: "POST",
        body: clean({
          title: v.title,
          priority: v.priority,
          dueAt: v.dueAt ? dateToIso(v.dueAt) : undefined,
          dealId,
          accountId,
        }),
      }),
    onSuccess: async () => {
      toast.show(t("tasks.created"));
      await invalidate();
      form.reset();
      onOpenChange(false);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("tasks.form.title")}
      closeLabel={tc("actions.close")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc("actions.cancel")}
          </Button>
          <Button type="submit" form="task-form" loading={save.isPending}>
            {t("tasks.form.submit")}
          </Button>
        </>
      }
    >
      <form
        id="task-form"
        noValidate
        onSubmit={form.handleSubmit((v) => save.mutate(v))}
        className="flex flex-col gap-4"
      >
        {save.isError ? <Alert tone="error">{errorMessage(tc, save.error)}</Alert> : null}
        <Field label={t("tasks.form.name")} error={form.formState.errors.title?.message} required>
          {(p) => <Input autoFocus {...p} {...form.register("title")} />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("tasks.form.due")}>
            {(p) => <Input type="date" {...p} {...form.register("dueAt")} />}
          </Field>
          <Field label={t("tasks.form.priority")}>
            {(p) => (
              <Select {...p} {...form.register("priority")}>
                {TASK_PRIORITIES.map((x) => (
                  <option key={x} value={x}>
                    {t(`tasks.priority.${x}`)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </form>
    </Dialog>
  );
}

export function TaskRow({ task, canUpdate }: { task: TaskDto; canUpdate: boolean }) {
  const { t } = useTranslation("crm");
  const fmt = useFormatters();
  const toast = useToast();
  const invalidate = useInvalidateCrm();
  const done = task.status === "done";
  const toggle = useMutation({
    mutationFn: () =>
      api(`/crm/tasks/${task.id}/${done ? "reopen" : "complete"}`, { method: "POST" }),
    onSuccess: async () => {
      if (!done) toast.show(t("tasks.completed"));
      await invalidate();
    },
  });
  const overdue = !done && isOverdue(task.dueAt);
  return (
    <li className="border-line bg-surface flex items-start gap-3 rounded-control border p-3">
      <input
        type="checkbox"
        className="accent-action-primary mt-1 size-5 shrink-0"
        checked={done}
        disabled={!canUpdate || toggle.isPending}
        aria-label={
          done
            ? t("tasks.reopen", { title: task.title })
            : t("tasks.complete", { title: task.title })
        }
        onChange={() => toggle.mutate()}
      />
      <div className="min-w-0 flex-1">
        <p className={done ? "text-secondary text-sm line-through" : "text-sm font-medium"}>
          {task.title}
        </p>
        <p className="text-secondary mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
          <span className={overdue ? "text-error font-semibold" : undefined}>
            {task.dueAt ? t("tasks.due", { date: fmt.date(task.dueAt) }) : t("tasks.noDue")}
            {overdue ? ` · ${t("common.overdue")}` : ""}
          </span>
          {task.dealName ? <span>· {task.dealName}</span> : null}
          {task.accountName ? <span>· {task.accountName}</span> : null}
        </p>
      </div>
      {task.priority === "high" ? <Badge tone="warning">{t("tasks.priority.high")}</Badge> : null}
    </li>
  );
}
