import { DELIVERY_TASK_STATUSES, PROJECT_STATUSES } from "@nexo/contracts";
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
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../shared/api/client";
import { errorMessage } from "../../shared/api/errors";
import { useCan } from "../../shared/api/queries";
import { delivery, HEALTH_TONE, STATUS_TONE, useProject } from "./api";

const hours = (minutes: number) =>
  `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, "0")} min`;

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { t } = useTranslation("delivery");
  const { t: tc } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const canUpdate = useCan("delivery:project:update");
  const canTask = useCan("delivery:task:create");
  const canTaskUpdate = useCan("delivery:task:update");
  const canTime = useCan("delivery:time:create");
  const project = useProject(projectId);
  const [taskTitle, setTaskTitle] = useState("");
  const [minutes, setMinutes] = useState("");
  const [note, setNote] = useState("");

  const refresh = () => qc.invalidateQueries({ queryKey: delivery.all });
  const run = useMutation({
    mutationFn: (a: { method: "POST" | "PATCH"; path: string; body: unknown }) =>
      api(a.path, { method: a.method, body: a.body }),
    onSuccess: refresh,
  });

  if (project.isLoading) return <Skeleton className="h-64" />;
  if (!project.data) return <Alert tone="error">{t("notFound")}</Alert>;
  const { project: p, tasks, milestones, time } = project.data;

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/delivery/projects"
        className="text-secondary text-sm underline-offset-2 hover:underline"
      >
        ← {t("back")}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">{p.name}</h1>
            <Badge tone={STATUS_TONE[p.status]}>{t(`status.${p.status}`)}</Badge>
            <Badge tone={HEALTH_TONE[p.health]}>{t(`health.${p.health}`)}</Badge>
          </div>
          <p className="text-secondary mt-1 text-sm">
            {p.accountName ?? t("noValue")} · {t("owner")}: {p.ownerName ?? t("noValue")} ·{" "}
            {t("col.due")}: {p.dueOn ?? t("noValue")} ·{" "}
            {t("logged", { time: hours(p.minutesLogged) })}
          </p>
        </div>
        {canUpdate ? (
          <Select
            aria-label={t("col.status")}
            value={p.status}
            onChange={(e) =>
              run.mutate({
                method: "PATCH",
                path: `/delivery/projects/${p.id}`,
                body: { status: e.target.value },
              })
            }
            className="w-48"
          >
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        ) : null}
      </header>
      {run.isError ? <Alert tone="error">{errorMessage(tc, run.error)}</Alert> : null}
      {p.summary ? <p className="text-secondary whitespace-pre-wrap text-sm">{p.summary}</p> : null}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title={t("tasks")} />
          {canTask ? (
            <form
              className="mb-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!taskTitle.trim()) return;
                run.mutate(
                  {
                    method: "POST",
                    path: `/delivery/projects/${p.id}/tasks`,
                    body: { title: taskTitle.trim() },
                  },
                  { onSuccess: () => setTaskTitle("") },
                );
              }}
            >
              <Input
                aria-label={t("newTask")}
                placeholder={t("newTask")}
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
              />
              <Button type="submit" variant="secondary">
                {t("add")}
              </Button>
            </form>
          ) : null}
          <ul className="flex flex-col gap-2" aria-label={t("tasks")}>
            {tasks.map((task) => {
              const milestone = milestones.find((m) => m.id === task.milestoneId);
              return (
                <li
                  key={task.id}
                  className="border-line flex flex-wrap items-center justify-between gap-2 rounded-control border p-3"
                >
                  <div className="min-w-0">
                    <p
                      className={
                        task.status === "done"
                          ? "text-secondary text-sm line-through"
                          : "text-sm font-medium"
                      }
                    >
                      {task.title}
                    </p>
                    <p className="text-secondary text-xs">
                      {[milestone?.name, task.assigneeName, task.dueOn].filter(Boolean).join(" · ")}
                      {task.overdue ? (
                        <span className="text-error font-semibold"> · {t("overdueTask")}</span>
                      ) : null}
                    </p>
                  </div>
                  <Select
                    aria-label={t("taskStatus", { title: task.title })}
                    value={task.status}
                    disabled={!canTaskUpdate}
                    onChange={(e) =>
                      run.mutate({
                        method: "PATCH",
                        path: `/delivery/tasks/${task.id}`,
                        body: { status: e.target.value },
                      })
                    }
                    className="w-36"
                  >
                    {DELIVERY_TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {t(`taskStatuses.${s}`)}
                      </option>
                    ))}
                  </Select>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title={t("milestones")} />
            <ul className="flex flex-col gap-2">
              {milestones.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={m.status === "done" ? "text-secondary line-through" : undefined}>
                    {m.name}
                    {m.dueOn ? <span className="text-secondary"> · {m.dueOn}</span> : null}
                  </span>
                  {canUpdate ? (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        run.mutate({
                          method: "PATCH",
                          path: `/delivery/milestones/${m.id}`,
                          body: { status: m.status === "done" ? "pending" : "done" },
                        })
                      }
                    >
                      {m.status === "done" ? t("reopen") : t("complete")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title={t("time")} />
            {canTime ? (
              <form
                className="mb-4 grid gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(minutes);
                  if (!Number.isInteger(n) || n < 1) return;
                  run.mutate(
                    {
                      method: "POST",
                      path: `/delivery/projects/${p.id}/time`,
                      body: { minutes: n, ...(note.trim() ? { note: note.trim() } : {}) },
                    },
                    {
                      onSuccess: () => {
                        setMinutes("");
                        setNote("");
                        toast.show(t("timeLogged"));
                      },
                    },
                  );
                }}
              >
                <Field label={t("minutes")}>
                  {(f) => (
                    <Input
                      {...f}
                      inputMode="numeric"
                      value={minutes}
                      onChange={(e) => setMinutes(e.target.value)}
                    />
                  )}
                </Field>
                <Field label={t("note")}>
                  {(f) => <Input {...f} value={note} onChange={(e) => setNote(e.target.value)} />}
                </Field>
                <div>
                  <Button type="submit" variant="secondary">
                    {t("logTime")}
                  </Button>
                </div>
              </form>
            ) : null}
            <ul className="flex flex-col gap-1.5 text-sm">
              {time.map((e) => (
                <li key={e.id} className="flex justify-between gap-2">
                  <span>
                    {hours(e.minutes)}
                    {e.note ? ` · ${e.note}` : ""}
                  </span>
                  <span className="text-secondary text-xs">
                    {e.workedOn}
                    {e.membershipName ? ` · ${e.membershipName}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
