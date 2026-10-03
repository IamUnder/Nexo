import { Alert, Button, useToast } from "@nexo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { useCan } from "../../shared/api/queries";
import { crm, useSampleStatus } from "./api";

/** Cargar / quitar los datos de ejemplo (solo quien gestiona el embudo). `variant`: botón de la cabecera o de un estado vacío. */
export function SampleDataControls({ mode }: { mode: "load" | "remove" }) {
  const { t } = useTranslation("crm");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const canManage = useCan("crm:pipeline:manage");
  const status = useSampleStatus(canManage);
  const run = useMutation({
    mutationFn: () =>
      mode === "load"
        ? api("/crm/sample-data", { method: "POST" })
        : api("/crm/sample-data", { method: "DELETE" }),
    onSuccess: async () => {
      toast.show(mode === "load" ? t("sample.loaded") : t("sample.removed"));
      await qc.invalidateQueries({ queryKey: crm.all });
    },
  });
  if (!canManage || !status.data) return null;
  if (mode === "load" && status.data.loaded) return null;
  if (mode === "remove" && !status.data.loaded) return null;
  return (
    <>
      {run.isError ? <Alert tone="error">{errorMessage(tc, run.error)}</Alert> : null}
      <Button
        variant="secondary"
        loading={run.isPending}
        onClick={() => {
          if (mode === "remove" && !window.confirm(t("sample.removeConfirm"))) return;
          run.mutate();
        }}
      >
        {mode === "load" ? t("sample.load") : t("sample.remove")}
      </Button>
    </>
  );
}
