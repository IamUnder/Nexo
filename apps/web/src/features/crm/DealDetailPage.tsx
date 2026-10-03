import { zodResolver } from "@hookform/resolvers/zod";
import type { DealDto } from "@nexo/contracts";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  Select,
  Skeleton,
  useToast,
} from "@nexo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { useCan } from "../../shared/api/queries";
import {
  clean,
  crm,
  dateToIso,
  isoToDateInput,
  parseAmountToCents,
  useDeal,
  usePipelines,
  useTasks,
} from "./api";
import {
  ActivityTimeline,
  isOverdue,
  LoseDealDialog,
  STATUS_TONE,
  TaskDialog,
  TaskRow,
  useDealActions,
  useFormatters,
} from "./components";

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-secondary text-xs uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

function EditDealForm({ deal }: { deal: DealDto }) {
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const required = tc("errors:validation.failed");
  const schema = useMemo(
    () =>
      z.object({
        name: z.string().trim().min(2, required).max(160),
        amount: z.string().refine((v) => parseAmountToCents(v) !== null, required),
        expectedCloseOn: z.string(),
        nextActionText: z.string().trim().max(200),
        nextActionAt: z.string(),
      }),
    [required],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: deal.name,
      amount: String(deal.amountCents / 100).replace(".", ","),
      expectedCloseOn: deal.expectedCloseOn ?? "",
      nextActionText: deal.nextActionText ?? "",
      nextActionAt: isoToDateInput(deal.nextActionAt),
    },
  });
  const save = useMutation({
    mutationFn: (v: Values) =>
      api<DealDto>(`/crm/deals/${deal.id}`, {
        method: "PATCH",
        body: {
          name: v.name,
          amountCents: parseAmountToCents(v.amount) ?? 0,
          expectedCloseOn: v.expectedCloseOn || null,
          nextActionText: v.nextActionText || null,
          nextActionAt: v.nextActionAt ? dateToIso(v.nextActionAt) : null,
        },
      }),
    onSuccess: async () => {
      toast.show(t("deals.detail.saved"));
      await qc.invalidateQueries({ queryKey: crm.all });
    },
  });
  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((v) => save.mutate(v))}
      className="flex flex-col gap-4"
    >
      {save.isError ? <Alert tone="error">{errorMessage(tc, save.error)}</Alert> : null}
      <Field label={t("deals.create.name")} error={form.formState.errors.name?.message} required>
        {(p) => <Input {...p} {...form.register("name")} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("deals.create.amount")} error={form.formState.errors.amount?.message}>
          {(p) => <Input inputMode="decimal" {...p} {...form.register("amount")} />}
        </Field>
        <Field label={t("deals.create.expectedClose")}>
          {(p) => <Input type="date" {...p} {...form.register("expectedCloseOn")} />}
        </Field>
        <Field label={t("deals.create.nextActionText")}>
          {(p) => <Input {...p} {...form.register("nextActionText")} />}
        </Field>
        <Field label={t("deals.create.nextActionAt")}>
          {(p) => <Input type="date" {...p} {...form.register("nextActionAt")} />}
        </Field>
      </div>
      <div>
        <Button type="submit" loading={save.isPending}>
          {t("deals.detail.save")}
        </Button>
      </div>
    </form>
  );
}

/** Ficha de oportunidad: datos, acciones de cierre, timeline y tareas. */
export function DealDetailPage() {
  const { dealId } = useParams({ strict: false }) as { dealId: string };
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const fmt = useFormatters();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const canUpdate = useCan("crm:deal:update");
  const canDelete = useCan("crm:deal:delete");
  const canTask = useCan("crm:task:create");
  const canTaskUpdate = useCan("crm:task:update");
  const canActivity = useCan("crm:activity:create");
  const deal = useDeal(dealId);
  const pipelines = usePipelines();
  const tasks = useTasks({ dealId });
  const actions = useDealActions();
  const [losing, setLosing] = useState<DealDto | null>(null);
  const [taskOpen, setTaskOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api(`/crm/deals/${dealId}`, { method: "DELETE" }),
    onSuccess: async () => {
      toast.show(t("deals.detail.deleted"));
      await qc.invalidateQueries({ queryKey: crm.all });
      void navigate({ to: "/crm/deals" });
    },
  });

  if (deal.isLoading) return <Skeleton className="h-64" />;
  if (deal.isError || !deal.data) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="error">{t("deals.detail.notFound")}</Alert>
        <Link to="/crm/deals" className="text-action-primary underline">
          {t("deals.detail.back")}
        </Link>
      </div>
    );
  }
  const d = deal.data;
  const stages = pipelines.data?.find((p) => p.id === d.pipelineId)?.stages ?? [];
  const pending = actions.move.isPending || actions.win.isPending || actions.reopen.isPending;
  const err = actions.move.error ?? actions.win.error ?? actions.reopen.error ?? remove.error;
  const overdue = d.status === "open" && isOverdue(d.nextActionAt);

  return (
    <div className="flex flex-col gap-6">
      <Link to="/crm/deals" className="text-secondary text-sm underline-offset-2 hover:underline">
        ← {t("deals.detail.back")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{d.name}</h1>
            <Badge tone={STATUS_TONE[d.status] ?? "neutral"}>{t(`deals.status.${d.status}`)}</Badge>
          </div>
          <p className="text-secondary mt-1 text-sm">
            <Link
              to="/crm/accounts/$accountId"
              params={{ accountId: d.accountId }}
              className="underline-offset-2 hover:underline"
            >
              {d.accountName}
            </Link>
            {" · "}
            {fmt.money(d.amountCents, d.currency)}
            {d.closedAt ? ` · ${t("deals.detail.closedAt", { date: fmt.date(d.closedAt) })}` : ""}
          </p>
        </div>
        {canUpdate ? (
          <div className="flex flex-wrap gap-2">
            {d.status === "open" ? (
              <>
                <Button onClick={() => actions.win.mutate(d.id)} loading={actions.win.isPending}>
                  {t("deals.win")}
                </Button>
                <Button variant="secondary" onClick={() => setLosing(d)}>
                  {t("deals.lose")}
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                onClick={() => actions.reopen.mutate(d.id)}
                loading={actions.reopen.isPending}
              >
                {t("deals.reopen")}
              </Button>
            )}
          </div>
        ) : null}
      </header>

      {err ? <Alert tone="error">{errorMessage(tc, err)}</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title={t("deals.detail.details")} />
            <dl className="grid grid-cols-2 gap-4">
              <Info label={t("deals.detail.stage")}>
                {d.status === "open" && canUpdate && stages.length > 0 ? (
                  <Select
                    aria-label={t("deals.detail.stage")}
                    value={d.stageId}
                    disabled={pending}
                    onChange={(e) => {
                      const target = stages.find((s) => s.id === e.target.value);
                      if (!target) return;
                      if (target.kind === "lost") setLosing(d);
                      else if (target.kind === "won") actions.win.mutate(d.id);
                      else actions.move.mutate({ id: d.id, stageId: target.id });
                    }}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                ) : (
                  d.stageName
                )}
              </Info>
              <Info label={t("deals.detail.probability")}>{d.probability}%</Info>
              <Info label={t("deals.detail.owner")}>{d.ownerName ?? t("common.none")}</Info>
              <Info label={t("deals.detail.contact")}>
                {d.primaryContactName ?? t("common.noValue")}
              </Info>
              <Info label={t("deals.detail.expectedClose")}>
                {fmt.date(d.expectedCloseOn) ?? t("common.noValue")}
              </Info>
              {d.status === "open" ? (
                <Info label={t("deals.card.nextAction")}>
                  <span className={overdue ? "text-error font-semibold" : undefined}>
                    {d.nextActionText || d.nextActionAt
                      ? `${d.nextActionText ?? ""}${d.nextActionAt ? ` (${fmt.date(d.nextActionAt)})` : ""}`
                      : t("deals.card.noNextAction")}
                  </span>
                </Info>
              ) : null}
              {d.lostReason ? (
                <Info label={t("deals.detail.lostReason")}>{d.lostReason}</Info>
              ) : null}
            </dl>
          </Card>

          {canUpdate ? (
            <Card>
              <CardHeader title={t("deals.detail.save")} />
              <EditDealForm deal={d} />
            </Card>
          ) : null}

          <Card>
            <CardHeader
              title={t("deals.detail.tasks")}
              actions={
                canTask ? (
                  <Button variant="secondary" onClick={() => setTaskOpen(true)}>
                    {t("tasks.new")}
                  </Button>
                ) : undefined
              }
            />
            {tasks.data?.length === 0 ? (
              <p className="text-secondary text-sm">{t("deals.detail.noTasks")}</p>
            ) : null}
            <ul className="flex flex-col gap-2" aria-label={t("tasks.list")}>
              {tasks.data?.map((task) => (
                <TaskRow key={task.id} task={task} canUpdate={canTaskUpdate} />
              ))}
            </ul>
          </Card>

          {canDelete ? (
            <div>
              <Button
                variant="ghost"
                loading={remove.isPending}
                onClick={() => {
                  if (window.confirm(t("deals.detail.deleteConfirm"))) remove.mutate();
                }}
              >
                {t("deals.detail.delete")}
              </Button>
            </div>
          ) : null}
        </div>

        <Card>
          <CardHeader title={t("deals.detail.timeline")} />
          <ActivityTimeline filter={{ dealId: d.id }} canCreate={canActivity} />
        </Card>
      </div>

      <LoseDealDialog deal={losing} onOpenChange={(o) => !o && setLosing(null)} />
      <TaskDialog open={taskOpen} onOpenChange={setTaskOpen} dealId={d.id} />
    </div>
  );
}
