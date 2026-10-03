import type { ProjectDto } from "@nexo/contracts";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Field,
  Icon,
  Input,
  Skeleton,
  Table,
  Td,
  THead,
  Th,
  Tr,
  useToast,
} from "@nexo/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { useCan } from "../../shared/api/queries";
import { delivery, HEALTH_TONE, STATUS_TONE, useProjects } from "./api";

/** Lista de proyectos de una cuenta (o de todas); también la usa la ficha de empresa como «slot». */
export function ProjectsTable({ projects }: { projects: ProjectDto[] }) {
  const { t } = useTranslation("delivery");
  return (
    <Table label={t("table")}>
      <THead>
        <Tr>
          <Th>{t("col.name")}</Th>
          <Th>{t("col.account")}</Th>
          <Th>{t("col.status")}</Th>
          <Th>{t("col.progress")}</Th>
          <Th>{t("col.due")}</Th>
        </Tr>
      </THead>
      <tbody>
        {projects.map((p) => (
          <Tr key={p.id}>
            <Td>
              <Link
                to="/delivery/projects/$projectId"
                params={{ projectId: p.id }}
                className="font-medium underline-offset-2 hover:underline"
              >
                {p.name}
              </Link>
            </Td>
            <Td>
              {p.accountName ?? t("noValue")}
              {p.accountArchived ? ` (${t("archived")})` : ""}
            </Td>
            <Td>
              <span className="flex flex-wrap gap-1">
                <Badge tone={STATUS_TONE[p.status]}>{t(`status.${p.status}`)}</Badge>
                <Badge tone={HEALTH_TONE[p.health]}>{t(`health.${p.health}`)}</Badge>
              </span>
            </Td>
            <Td className="tabular">
              {p.tasksDone}/{p.tasksTotal}
              {p.tasksOverdue > 0 ? ` · ${t("overdue", { count: p.tasksOverdue })}` : ""}
            </Td>
            <Td>{p.dueOn ?? t("noValue")}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

/** Proyectos de una empresa para la ficha de cuenta. */
export function AccountProjects({ accountId }: { accountId: string }) {
  const { t } = useTranslation("delivery");
  const projects = useProjects(accountId);
  if (!projects.data || projects.data.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label={t("accountSlot")}>
      <h2 className="font-display text-base font-semibold">{t("accountSlot")}</h2>
      <ProjectsTable projects={projects.data} />
    </section>
  );
}

function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { t } = useTranslation("delivery");
  const { t: tc } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [dueOn, setDueOn] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api<ProjectDto>("/delivery/projects", {
        method: "POST",
        body: { name: name.trim(), ...(dueOn ? { dueOn } : {}) },
      }),
    onSuccess: async (p) => {
      toast.show(t("created"));
      await qc.invalidateQueries({ queryKey: delivery.all });
      setName("");
      setDueOn("");
      onOpenChange(false);
      void navigate({ to: "/delivery/projects/$projectId", params: { projectId: p.id } });
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("new")}
      closeLabel={tc("actions.close")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {tc("actions.cancel")}
          </Button>
          <Button
            onClick={() => create.mutate()}
            loading={create.isPending}
            disabled={name.trim().length < 2}
          >
            {t("create")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {create.isError ? <Alert tone="error">{errorMessage(tc, create.error)}</Alert> : null}
        <Field label={t("col.name")} required>
          {(p) => <Input autoFocus {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={t("col.due")}>
          {(p) => (
            <Input type="date" {...p} value={dueOn} onChange={(e) => setDueOn(e.target.value)} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

export function ProjectsPage() {
  const { t } = useTranslation("delivery");
  const canCreate = useCan("delivery:project:create");
  const projects = useProjects();
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("title")}</h1>
          <p className="text-secondary text-sm">{t("subtitle")}</p>
        </div>
        {canCreate ? (
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            {t("new")}
          </Button>
        ) : null}
      </header>
      {projects.isLoading ? <Skeleton className="h-32" /> : null}
      {projects.data && projects.data.length === 0 ? (
        <EmptyState icon="file" title={t("empty.title")} description={t("empty.description")} />
      ) : null}
      {projects.data && projects.data.length > 0 ? (
        <ProjectsTable projects={projects.data} />
      ) : null}
      <NewProjectDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
