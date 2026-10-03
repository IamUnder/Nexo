import type { DealDto, StageDto } from "@nexo/contracts";
import { Badge, Button, EmptyState, Icon, Input, Menu, Select, Skeleton } from "@nexo/ui";
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useCan } from "../../shared/api/queries";
import { useDeals, usePipelines } from "./api";
import { DealDialog, isOverdue, LoseDealDialog, useDealActions, useFormatters } from "./components";
import { SampleDataControls } from "./SampleDataControls";

function DealCard({
  deal,
  stages,
  canUpdate,
  onLose,
  onMove,
}: {
  deal: DealDto;
  stages: StageDto[];
  canUpdate: boolean;
  onLose: (d: DealDto) => void;
  onMove: (d: DealDto, stage: StageDto) => void;
}) {
  const { t } = useTranslation("crm");
  const fmt = useFormatters();
  const overdue = deal.status === "open" && isOverdue(deal.nextActionAt);
  const targets = stages.filter((s) => s.id !== deal.stageId);

  return (
    <article
      className="border-line bg-surface-raised shadow-elevation-1 flex cursor-grab flex-col gap-1.5 rounded-control border p-3 active:cursor-grabbing"
      draggable={canUpdate && deal.status === "open"}
      onDragStart={(e) => e.dataTransfer.setData("text/deal", deal.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          to="/crm/deals/$dealId"
          params={{ dealId: deal.id }}
          className="text-sm font-semibold outline-none hover:underline focus-visible:outline-2 focus-visible:outline-focus"
        >
          {deal.name}
        </Link>
        {canUpdate && deal.status === "open" ? (
          <Menu
            trigger={
              <Button
                variant="ghost"
                aria-label={t("deals.card.actions", { name: deal.name })}
                className="-mr-2 -mt-1 h-8 px-2"
              >
                <Icon name="more" size={16} />
              </Button>
            }
            items={[
              ...targets.map((s) => ({
                key: s.id,
                label: `${t("deals.card.moveTo")} ${s.name}`,
                onSelect: () => (s.kind === "lost" ? onLose(deal) : onMove(deal, s)),
              })),
            ]}
          />
        ) : null}
      </div>
      <p className="text-secondary truncate text-xs">{deal.accountName}</p>
      <p className="text-sm font-medium">{fmt.money(deal.amountCents, deal.currency)}</p>
      {deal.status === "open" ? (
        <p className={overdue ? "text-error text-xs font-semibold" : "text-secondary text-xs"}>
          {deal.nextActionText || deal.nextActionAt
            ? `${t("deals.card.nextAction")}: ${deal.nextActionText ?? ""}${deal.nextActionAt ? ` (${fmt.date(deal.nextActionAt)})` : ""}`
            : t("deals.card.noNextAction")}
        </p>
      ) : null}
    </article>
  );
}

/** Tablero de oportunidades por etapas (arrastrar o menú «Mover a…»). */
export function DealsPage() {
  const { t } = useTranslation("crm");
  const fmt = useFormatters();
  const canCreate = useCan("crm:deal:create");
  const canUpdate = useCan("crm:deal:update");
  const pipelines = usePipelines();
  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [losing, setLosing] = useState<DealDto | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const actions = useDealActions();

  const pipeline = useMemo(
    () =>
      pipelines.data?.find((p) => p.id === pipelineId) ??
      pipelines.data?.find((p) => p.isDefault) ??
      pipelines.data?.[0],
    [pipelines.data, pipelineId],
  );
  const deals = useDeals(pipeline?.id, search);

  const byStage = useMemo(() => {
    const m = new Map<string, DealDto[]>();
    for (const d of deals.data ?? []) m.set(d.stageId, [...(m.get(d.stageId) ?? []), d]);
    return m;
  }, [deals.data]);

  const move = (deal: DealDto, stage: StageDto) => {
    if (deal.stageId === stage.id || deal.status !== "open") return;
    if (stage.kind === "lost") return setLosing(deal);
    if (stage.kind === "won") return actions.win.mutate(deal.id);
    actions.move.mutate({ id: deal.id, stageId: stage.id });
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("deals.title")}</h1>
          <p className="text-secondary text-sm">{t("deals.subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SampleDataControls mode="remove" />
          {canCreate ? (
            <Button onClick={() => setCreating(true)}>
              <Icon name="plus" size={16} />
              {t("deals.new")}
            </Button>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <Icon
            name="search"
            size={16}
            className="text-secondary pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          />
          <Input
            type="search"
            aria-label={t("deals.search")}
            placeholder={t("deals.search")}
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {(pipelines.data?.length ?? 0) > 1 ? (
          <Select
            aria-label={t("deals.pipeline")}
            value={pipeline?.id}
            onChange={(e) => setPipelineId(e.target.value)}
            className="w-56"
          >
            {pipelines.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      {pipelines.isLoading || deals.isLoading ? (
        <div className="grid gap-3 md:grid-cols-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : null}

      {pipeline && deals.data && deals.data.length === 0 && !search ? (
        <EmptyState
          icon="briefcase"
          title={t("deals.empty.title")}
          description={t("deals.empty.description")}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {canCreate ? (
                <Button onClick={() => setCreating(true)}>{t("deals.new")}</Button>
              ) : null}
              <SampleDataControls mode="load" />
            </div>
          }
        />
      ) : null}

      {pipeline && deals.data && (deals.data.length > 0 || search) ? (
        <section
          aria-label={t("deals.board")}
          className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0"
        >
          {pipeline.stages.map((stage) => {
            const items = byStage.get(stage.id) ?? [];
            const total = items.reduce((n, d) => n + d.amountCents, 0);
            return (
              <section
                key={stage.id}
                aria-label={stage.name}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(stage.id);
                }}
                onDragLeave={() => setDragOver((s) => (s === stage.id ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const deal = deals.data?.find(
                    (d) => d.id === e.dataTransfer.getData("text/deal"),
                  );
                  if (deal) move(deal, stage);
                }}
                className={`bg-surface border-line flex w-72 shrink-0 flex-col gap-2 rounded-card border p-3 ${dragOver === stage.id ? "outline-2 outline-focus" : ""}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">{stage.name}</h2>
                  {stage.kind !== "open" ? (
                    <Badge tone={stage.kind === "won" ? "success" : "error"}>
                      {t(`deals.status.${stage.kind}`)}
                    </Badge>
                  ) : null}
                </div>
                <p className="text-secondary text-xs">
                  {t("deals.column.count", { count: items.length })} · {fmt.money(total)}
                </p>
                <div className="flex flex-col gap-2">
                  {items.map((d) => (
                    <DealCard
                      key={d.id}
                      deal={d}
                      stages={pipeline.stages}
                      canUpdate={canUpdate}
                      onLose={setLosing}
                      onMove={move}
                    />
                  ))}
                  {items.length === 0 ? (
                    <p className="text-secondary py-4 text-center text-xs">
                      {t("deals.column.empty")}
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </section>
      ) : null}

      <DealDialog open={creating} onOpenChange={setCreating} pipelineId={pipeline?.id} />
      <LoseDealDialog deal={losing} onOpenChange={(o) => !o && setLosing(null)} />
    </div>
  );
}
