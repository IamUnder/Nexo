import {
  type BatchDto,
  type BatchRowDto,
  IMPORT_FIELDS,
  type ImportEntity,
  MAX_IMPORT_ROWS,
} from "@nexo/contracts";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  Field,
  Icon,
  Select,
  Skeleton,
  Table,
  Td,
  THead,
  Th,
  Tr,
  useToast,
} from "@nexo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, downloadFile } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { useCan, useMe } from "../../shared/api/queries";
import { buildCsv, type CsvTable, decodeCsv, readCsv } from "../../shared/csv";
import { suggestMapping } from "./suggest";

const key = {
  batches: ["import", "batches"] as const,
  batch: (id: string) => ["import", "batch", id] as const,
  rows: (id: string) => ["import", "rows", id] as const,
};

const STATUS_TONE = {
  simulated: "info",
  running: "warning",
  completed: "success",
  failed: "error",
  rolled_back: "neutral",
} as const;

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-line rounded-control border p-3">
      <p className="text-secondary text-xs">{label}</p>
      <p className="font-display tabular text-2xl font-bold">{value}</p>
    </div>
  );
}

/** Resultado de un lote: estadísticas, filas con problemas descargables y (si procede) deshacer. */
function BatchView({ batchId, onDone }: { batchId: string; onDone: () => void }) {
  const { t } = useTranslation("import");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const canCreate = useCan("import:batch:create");
  const canRollback = useCan("import:batch:rollback");
  const batch = useQuery({
    queryKey: key.batch(batchId),
    queryFn: () => api<BatchDto>(`/import/batches/${batchId}`),
    // Mientras se ejecuta, se consulta cada segundo (la ejecución es asíncrona).
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1000 : false),
  });
  const rows = useQuery({
    queryKey: [...key.rows(batchId), batch.data?.status],
    queryFn: () => api<BatchRowDto[]>(`/import/batches/${batchId}/rows?limit=5000`),
    enabled: !!batch.data && batch.data.status !== "running",
    select: (all) => all.filter((r) => r.errors.length > 0 || r.status === "invalid"),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["import"] });
  // Importar o deshacer cambia datos del CRM y del panel: se descartan sus cachés (por prefijo de clave,
  // sin importar la feature `crm`).
  const status = batch.data?.status;
  useEffect(() => {
    if (status === "completed" || status === "rolled_back" || status === "failed") {
      void qc.invalidateQueries({ queryKey: ["crm"] });
      void qc.invalidateQueries({ queryKey: ["insights"] });
    }
  }, [status, qc]);
  const execute = useMutation({
    mutationFn: () => api(`/import/batches/${batchId}/execute`, { method: "POST" }),
    onSuccess: refresh,
  });
  const rollback = useMutation({
    mutationFn: () =>
      api<{ kept: number }>(`/import/batches/${batchId}/rollback`, { method: "POST" }),
    onSuccess: async (r) => {
      toast.show(r.kept > 0 ? t("rollback.keptSome", { count: r.kept }) : t("rollback.done"));
      await refresh();
    },
  });
  const discard = useMutation({
    mutationFn: () => api(`/import/batches/${batchId}`, { method: "DELETE" }),
    onSuccess: async () => {
      await refresh();
      onDone();
    },
  });

  if (!batch.data) return <Skeleton className="h-40" />;
  const b = batch.data;
  const s = b.stats;
  const err = execute.error ?? rollback.error ?? discard.error;

  const downloadProblems = () => {
    const csv = buildCsv(
      [t("problems.row"), t("problems.status"), t("problems.detail")],
      (rows.data ?? []).map((r) => [
        String(r.rowNumber),
        t(`rowStatus.${r.status}`),
        r.errors.join(" · "),
      ]),
    );
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexo-importacion-${b.entity}-problemas.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[b.status]}>{t(`status.${b.status}`)}</Badge>
        <span className="text-secondary text-sm">{b.filename}</span>
      </div>

      {err ? <Alert tone="error">{errorMessage(tc, err)}</Alert> : null}
      {b.status === "running" ? (
        <Alert tone="info">
          {t("running", { done: s.created + s.updated + s.failed, total: s.toCreate + s.toUpdate })}
        </Alert>
      ) : null}
      {b.status === "failed" ? <Alert tone="error">{t("failed")}</Alert> : null}

      {b.status === "simulated" ? (
        <>
          <p className="text-secondary text-sm">{t("simulation.description")}</p>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label={t("stats.total")} value={s.total} />
            <Stat label={t("stats.toCreate")} value={s.toCreate} />
            <Stat label={t("stats.toUpdate")} value={s.toUpdate} />
            <Stat label={t("stats.duplicates")} value={s.duplicates} />
            <Stat label={t("stats.skipped")} value={s.skipped} />
            <Stat label={t("stats.invalid")} value={s.invalid} />
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label={t("stats.created")} value={s.created} />
          <Stat label={t("stats.updated")} value={s.updated} />
          <Stat label={t("stats.skipped")} value={s.skipped} />
          <Stat label={t("stats.failed")} value={s.failed + s.invalid} />
        </div>
      )}

      {rows.data && rows.data.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-display text-base font-semibold">{t("problems.title")}</h3>
            <Button variant="secondary" onClick={downloadProblems}>
              {t("problems.download")}
            </Button>
          </div>
          <Table label={t("problems.title")}>
            <THead>
              <Tr>
                <Th>{t("problems.row")}</Th>
                <Th>{t("problems.record")}</Th>
                <Th>{t("problems.status")}</Th>
                <Th>{t("problems.detail")}</Th>
              </Tr>
            </THead>
            <tbody>
              {rows.data.slice(0, 100).map((r) => (
                <Tr key={r.rowNumber}>
                  <Td className="tabular">{r.rowNumber}</Td>
                  <Td>{r.label}</Td>
                  <Td>{t(`rowStatus.${r.status}`)}</Td>
                  <Td>{r.errors.join(" · ")}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          {rows.data.length > 100 ? (
            <p className="text-secondary text-xs">
              {t("problems.more", { count: rows.data.length - 100 })}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {b.status === "simulated" && canCreate ? (
          <>
            <Button
              onClick={() => execute.mutate()}
              loading={execute.isPending}
              disabled={s.toCreate + s.toUpdate === 0}
            >
              {t("execute", { count: s.toCreate + s.toUpdate })}
            </Button>
            <Button
              variant="secondary"
              onClick={() => discard.mutate()}
              loading={discard.isPending}
            >
              {t("discard")}
            </Button>
          </>
        ) : null}
        {b.canRollback && canRollback ? (
          <Button
            variant="secondary"
            loading={rollback.isPending}
            onClick={() => {
              if (window.confirm(t("rollback.confirm"))) rollback.mutate();
            }}
          >
            {t("rollback.button")}
          </Button>
        ) : null}
        {b.status !== "simulated" && b.status !== "running" ? (
          <Button variant="ghost" onClick={onDone}>
            {t("another")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** Asistente: elegir → leer el CSV en el navegador → mapear → simular (sin escribir) → importar → deshacer. */
export function ImportPage() {
  const { t } = useTranslation("import");
  const { t: tc } = useTranslation();
  const { data: me } = useMe();
  const canCreate = useCan("import:batch:create");
  const canExport = useCan("import:data:export");
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<ImportEntity>("companies");
  const [onDuplicate, setOnDuplicate] = useState<"skip" | "update">("skip");
  const [file, setFile] = useState<{ name: string; table: CsvTable } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [batchId, setBatchId] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<unknown>(null);

  const history = useQuery({
    queryKey: key.batches,
    queryFn: () => api<BatchDto[]>("/import/batches"),
  });

  const fields = IMPORT_FIELDS[entity];
  const requiredOk = fields.required.some((f) => mapping[f]);
  const simulate = useMutation({
    mutationFn: () =>
      api<BatchDto>("/import/batches", {
        method: "POST",
        body: {
          entity,
          filename: file?.name ?? "importacion.csv",
          onDuplicate,
          mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)),
          rows: file?.table.rows ?? [],
        },
      }),
    onSuccess: async (b) => {
      setBatchId(b.id);
      await qc.invalidateQueries({ queryKey: key.batches });
    },
  });

  const load = async (f: File | undefined) => {
    setReadError(null);
    if (!f) return;
    const table = readCsv(decodeCsv(await f.arrayBuffer()));
    if (table.headers.length === 0 || table.rows.length === 0) {
      setFile(null);
      return setReadError(t("file.empty"));
    }
    if (table.rows.length > MAX_IMPORT_ROWS) {
      setFile(null);
      return setReadError(t("file.tooMany", { max: MAX_IMPORT_ROWS }));
    }
    setFile({ name: f.name, table });
    setMapping(suggestMapping(entity, table.headers));
  };

  const changeEntity = (e: ImportEntity) => {
    setEntity(e);
    if (file) setMapping(suggestMapping(e, file.table.headers));
  };

  const preview = useMemo(() => file?.table.rows.slice(0, 3) ?? [], [file]);
  const doExport = async (e: ImportEntity) => {
    setExportError(null);
    try {
      await downloadFile(`/import/export/${e}`, `nexo-${e}.csv`);
    } catch (err) {
      setExportError(err);
    }
  };

  if (batchId) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <Card>
          <BatchView
            batchId={batchId}
            onDone={() => {
              setBatchId(null);
              setFile(null);
              setMapping({});
              simulate.reset();
            }}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
        <p className="text-secondary text-sm">{t("subtitle")}</p>
      </header>

      {canCreate ? (
        <Card>
          <CardHeader title={t("step1.title")} description={t("step1.description")} />
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("step1.entity")}>
                {(p) => (
                  <Select
                    {...p}
                    value={entity}
                    onChange={(e) => changeEntity(e.target.value as ImportEntity)}
                  >
                    <option value="companies">{t("entity.companies")}</option>
                    <option value="contacts">{t("entity.contacts")}</option>
                  </Select>
                )}
              </Field>
              <Field label={t("step1.onDuplicate")} hint={t("step1.onDuplicateHint")}>
                {(p) => (
                  <Select
                    {...p}
                    value={onDuplicate}
                    onChange={(e) => setOnDuplicate(e.target.value as "skip" | "update")}
                  >
                    <option value="skip">{t("duplicate.skip")}</option>
                    <option value="update">{t("duplicate.update")}</option>
                  </Select>
                )}
              </Field>
            </div>
            <div>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                aria-label={t("file.label")}
                onChange={(e) => void load(e.target.files?.[0])}
              />
              <Button variant="secondary" onClick={() => fileInput.current?.click()}>
                <Icon name="upload" size={16} />
                {file ? t("file.change") : t("file.choose")}
              </Button>
              {file ? (
                <span className="text-secondary ml-3 text-sm">
                  {t("file.loaded", { name: file.name, count: file.table.rows.length })}
                </span>
              ) : null}
            </div>
            {readError ? <Alert tone="error">{readError}</Alert> : null}
          </div>
        </Card>
      ) : null}

      {file ? (
        <Card>
          <CardHeader title={t("step2.title")} description={t("step2.description")} />
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.all.map((f) => (
              <Field
                key={f}
                label={t(`fields.${entity}.${f}`)}
                {...(fields.required.some((r) => r === f) ? { hint: t("step2.requiredHint") } : {})}
              >
                {(p) => (
                  <Select
                    {...p}
                    value={mapping[f] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value }))}
                  >
                    <option value="">{t("step2.ignore")}</option>
                    {file.table.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            ))}
          </div>

          {preview.length > 0 ? (
            <div className="mt-5">
              <h3 className="font-display mb-2 text-sm font-semibold">{t("step2.preview")}</h3>
              <Table label={t("step2.preview")}>
                <THead>
                  <Tr>
                    {file.table.headers.slice(0, 6).map((h) => (
                      <Th key={h}>{h}</Th>
                    ))}
                  </Tr>
                </THead>
                <tbody>
                  {preview.map((r, i) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: vista previa estática de las primeras filas
                    <Tr key={i}>
                      {file.table.headers.slice(0, 6).map((h) => (
                        <Td key={h}>{r[h]}</Td>
                      ))}
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : null}

          {simulate.isError ? (
            <div className="mt-4">
              <Alert tone="error">{errorMessage(tc, simulate.error)}</Alert>
            </div>
          ) : null}
          <div className="mt-5 flex items-center gap-3">
            <Button
              onClick={() => simulate.mutate()}
              loading={simulate.isPending}
              disabled={!requiredOk}
            >
              {t("step2.simulate")}
            </Button>
            {!requiredOk ? (
              <span className="text-secondary text-sm">{t("step2.needRequired")}</span>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={t("history.title")} />
        {history.isLoading ? <Skeleton className="h-16" /> : null}
        {history.data && history.data.length === 0 ? (
          <EmptyState icon="file" title={t("history.empty")} />
        ) : null}
        <ul className="flex flex-col gap-2">
          {history.data?.map((b) => (
            <li
              key={b.id}
              className="border-line flex flex-wrap items-center justify-between gap-2 rounded-control border p-3 text-sm"
            >
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[b.status]}>{t(`status.${b.status}`)}</Badge>
                <span className="font-medium">{b.filename}</span>
                <span className="text-secondary">
                  {t(`entity.${b.entity}`)} ·{" "}
                  {new Date(b.createdAt).toLocaleString(me?.tenant.locale ?? "es-ES", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </span>
              </span>
              <Button variant="ghost" onClick={() => setBatchId(b.id)}>
                {t("history.open")}
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      {canExport ? (
        <Card>
          <CardHeader title={t("export.title")} description={t("export.description")} />
          {exportError ? <Alert tone="error">{errorMessage(tc, exportError)}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void doExport("companies")}>
              {t("export.companies")}
            </Button>
            <Button variant="secondary" onClick={() => void doExport("contacts")}>
              {t("export.contacts")}
            </Button>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
