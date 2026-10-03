import { Button, EmptyState, Icon, Tabs } from "@nexo/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCan } from "../../shared/api/queries";
import { useTasks } from "./api";
import { ListSkeleton, TaskDialog, TaskRow } from "./components";

function TaskList({ status }: { status: "open" | "done" }) {
  const { t } = useTranslation("crm");
  const canUpdate = useCan("crm:task:update");
  const tasks = useTasks({ status });
  if (tasks.isLoading) return <ListSkeleton />;
  if (tasks.data?.length === 0)
    return <EmptyState icon="tasks" title={t(`tasks.empty.${status}`)} />;
  return (
    <ul className="flex flex-col gap-2" aria-label={t("tasks.list")}>
      {tasks.data?.map((task) => (
        <TaskRow key={task.id} task={task} canUpdate={canUpdate} />
      ))}
    </ul>
  );
}

/** «Mis tareas»: pendientes (vencidas primero) y hechas. */
export function TasksPage() {
  const { t } = useTranslation("crm");
  const canCreate = useCan("crm:task:create");
  const [tab, setTab] = useState("open");
  const [creating, setCreating] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">{t("tasks.title")}</h1>
          <p className="text-secondary text-sm">{t("tasks.subtitle")}</p>
        </div>
        {canCreate ? (
          <Button onClick={() => setCreating(true)}>
            <Icon name="plus" size={16} />
            {t("tasks.new")}
          </Button>
        ) : null}
      </header>
      <Tabs
        label={t("tasks.title")}
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "open", label: t("tasks.open"), content: <TaskList status="open" /> },
          { value: "done", label: t("tasks.done"), content: <TaskList status="done" /> },
        ]}
      />
      <TaskDialog open={creating} onOpenChange={setCreating} />
    </div>
  );
}
