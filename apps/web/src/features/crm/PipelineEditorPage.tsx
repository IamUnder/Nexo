import { type PipelineDto, STAGE_KINDS } from "@nexo/contracts";
import {
  Alert,
  Button,
  Card,
  CardHeader,
  Field,
  Icon,
  Input,
  Select,
  Skeleton,
  useToast,
} from "@nexo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { crm, usePipelines } from "./api";

interface Row {
  /** Clave estable de la fila en pantalla (el `id` solo existe en etapas ya guardadas). */
  key: string;
  id?: string;
  name: string;
  probability: number;
  kind: (typeof STAGE_KINDS)[number];
  dealsCount: number;
}

const fromPipeline = (p: PipelineDto): Row[] =>
  p.stages.map((s) => ({
    key: s.id,
    id: s.id,
    name: s.name,
    probability: s.probability,
    kind: s.kind,
    dealsCount: s.dealsCount,
  }));

/** Editor de las etapas del embudo (la API valida: una ganada, una perdida, nombres únicos). */
export function PipelineEditorPage() {
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const pipelines = usePipelines();
  const pipeline = pipelines.data?.find((p) => p.isDefault) ?? pipelines.data?.[0];
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([]);

  useEffect(() => {
    if (pipeline) {
      setName(pipeline.name);
      setRows(fromPipeline(pipeline));
    }
  }, [pipeline]);

  const save = useMutation({
    mutationFn: () =>
      api(`/crm/pipelines/${pipeline?.id}/stages`, {
        method: "PUT",
        body: {
          name,
          stages: rows.map((r) => ({
            ...(r.id ? { id: r.id } : {}),
            name: r.name.trim(),
            probability: r.probability,
            kind: r.kind,
          })),
        },
      }),
    onSuccess: async () => {
      toast.show(t("pipelines.saved"));
      await qc.invalidateQueries({ queryKey: crm.all });
    },
  });

  const update = (key: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const move = (index: number, delta: number) =>
    setRows((rs) => {
      const next = [...rs];
      const target = index + delta;
      if (target < 0 || target >= next.length) return rs;
      [next[index], next[target]] = [next[target] as Row, next[index] as Row];
      return next;
    });

  if (pipelines.isLoading || !pipeline) return <Skeleton className="h-64" />;

  return (
    <div className="flex flex-col gap-5">
      <Link to="/crm/deals" className="text-secondary text-sm underline-offset-2 hover:underline">
        ← {t("deals.detail.back")}
      </Link>
      <Card>
        <CardHeader title={t("pipelines.title")} description={t("pipelines.description")} />
        <div className="flex flex-col gap-4">
          {save.isError ? <Alert tone="error">{errorMessage(tc, save.error)}</Alert> : null}
          <Field label={t("pipelines.name")}>
            {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <ol className="flex flex-col gap-3">
            {rows.map((r, i) => (
              <li
                key={r.key}
                className="border-line grid items-end gap-3 rounded-control border p-3 sm:grid-cols-[1fr_8rem_9rem_auto]"
              >
                <Field label={t("pipelines.stage")}>
                  {(p) => (
                    <Input
                      {...p}
                      value={r.name}
                      onChange={(e) => update(r.key, { name: e.target.value })}
                    />
                  )}
                </Field>
                <Field label={t("pipelines.probability")}>
                  {(p) => (
                    <Input
                      {...p}
                      type="number"
                      min={0}
                      max={100}
                      value={r.probability}
                      onChange={(e) => update(r.key, { probability: Number(e.target.value) })}
                    />
                  )}
                </Field>
                <Field label={t("pipelines.kind")}>
                  {(p) => (
                    <Select
                      {...p}
                      value={r.kind}
                      onChange={(e) => update(r.key, { kind: e.target.value as Row["kind"] })}
                    >
                      {STAGE_KINDS.map((k) => (
                        <option key={k} value={k}>
                          {t(`pipelines.kinds.${k}`)}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    aria-label={t("pipelines.up", { name: r.name })}
                    disabled={i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <Icon name="chevron-down" size={16} className="rotate-180" />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={t("pipelines.down", { name: r.name })}
                    disabled={i === rows.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <Icon name="chevron-down" size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={t("pipelines.remove", { name: r.name })}
                    title={
                      r.dealsCount > 0
                        ? t("pipelines.stageLocked", { count: r.dealsCount })
                        : undefined
                    }
                    disabled={r.dealsCount > 0}
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  >
                    <Icon name="trash" size={16} />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                setRows((rs) => [
                  ...rs,
                  {
                    key: `new-${rs.length}-${Date.now()}`,
                    name: "",
                    probability: 50,
                    kind: "open",
                    dealsCount: 0,
                  },
                ])
              }
            >
              <Icon name="plus" size={16} />
              {t("pipelines.add")}
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              {t("pipelines.save")}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
