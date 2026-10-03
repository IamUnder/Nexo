import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Tx } from "../../../platform/db/database";
import type {
  DeliveryRepository,
  MilestoneRow,
  ProjectPatch,
  ProjectRow,
  TaskPatch,
  TaskRow,
  TimeRow,
} from "../application/ports";
import { milestones, projects, tasks, timeEntries } from "./schema";

/** Subselects correlacionados: se califican con el nombre de tabla (ver nota de Drizzle en STATUS). */
const aggregates = (today: string) => ({
  tasksTotal: sql<number>`(select count(*)::int from delivery_tasks t where t.tenant_id = delivery_projects.tenant_id and t.project_id = delivery_projects.id)`,
  tasksDone: sql<number>`(select count(*)::int from delivery_tasks t where t.tenant_id = delivery_projects.tenant_id and t.project_id = delivery_projects.id and t.status = 'done')`,
  tasksOverdue: sql<number>`(select count(*)::int from delivery_tasks t where t.tenant_id = delivery_projects.tenant_id and t.project_id = delivery_projects.id and t.status <> 'done' and t.due_on < ${today}::date)`,
  minutesLogged: sql<number>`(select coalesce(sum(e.minutes), 0)::int from delivery_time_entries e where e.tenant_id = delivery_projects.tenant_id and e.project_id = delivery_projects.id)`,
});

const projectSelect = (today: string) => ({
  id: projects.id,
  name: projects.name,
  status: projects.status,
  health: projects.health,
  accountId: projects.accountId,
  accountName: projects.accountName,
  accountArchived: projects.accountArchived,
  sourceDealId: projects.sourceDealId,
  ownerMembershipId: projects.ownerMembershipId,
  startsOn: projects.startsOn,
  dueOn: projects.dueOn,
  summary: projects.summary,
  createdAt: projects.createdAt,
  updatedAt: projects.updatedAt,
  ...aggregates(today),
});

export class DbDeliveryRepository implements DeliveryRepository {
  async insertProject(tx: Tx, v: Parameters<DeliveryRepository["insertProject"]>[1]) {
    const [row] = await tx.insert(projects).values(v).returning({ id: projects.id });
    if (!row) throw new Error("No se pudo crear el proyecto");
    return row.id;
  }

  async findProject(tx: Tx, id: string, today: string): Promise<ProjectRow | null> {
    const [row] = await tx
      .select(projectSelect(today))
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    return (row as ProjectRow | undefined) ?? null;
  }

  async findProjectByDeal(tx: Tx, dealId: string, today: string): Promise<ProjectRow | null> {
    const [row] = await tx
      .select(projectSelect(today))
      .from(projects)
      .where(eq(projects.sourceDealId, dealId))
      .limit(1);
    return (row as ProjectRow | undefined) ?? null;
  }

  async listProjects(tx: Tx, f: Parameters<DeliveryRepository["listProjects"]>[1]) {
    const rows = await tx
      .select(projectSelect(f.today))
      .from(projects)
      .where(
        and(
          f.accountId ? eq(projects.accountId, f.accountId) : undefined,
          f.status ? eq(projects.status, f.status) : undefined,
        ),
      )
      .orderBy(desc(projects.createdAt))
      .limit(f.limit);
    return rows as ProjectRow[];
  }

  async updateProject(tx: Tx, id: string, patch: ProjectPatch) {
    await tx
      .update(projects)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projects.id, id));
  }

  async syncAccountName(tx: Tx, accountId: string, name: string) {
    await tx.update(projects).set({ accountName: name }).where(eq(projects.accountId, accountId));
  }

  async archiveAccount(tx: Tx, accountId: string) {
    await tx
      .update(projects)
      .set({ accountArchived: true })
      .where(eq(projects.accountId, accountId));
  }

  async listMilestones(tx: Tx, projectId: string): Promise<MilestoneRow[]> {
    return tx
      .select({
        id: milestones.id,
        projectId: milestones.projectId,
        name: milestones.name,
        dueOn: milestones.dueOn,
        status: milestones.status,
        position: milestones.position,
      })
      .from(milestones)
      .where(eq(milestones.projectId, projectId))
      .orderBy(asc(milestones.position), asc(milestones.id));
  }

  async insertMilestone(tx: Tx, v: Parameters<DeliveryRepository["insertMilestone"]>[1]) {
    const [{ n } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(milestones)
      .where(eq(milestones.projectId, v.projectId));
    const [row] = await tx
      .insert(milestones)
      .values({ ...v, position: n })
      .returning({ id: milestones.id });
    if (!row) throw new Error("No se pudo crear el hito");
    return row.id;
  }

  async findMilestone(tx: Tx, id: string): Promise<MilestoneRow | null> {
    const [row] = await tx
      .select({
        id: milestones.id,
        projectId: milestones.projectId,
        name: milestones.name,
        dueOn: milestones.dueOn,
        status: milestones.status,
        position: milestones.position,
      })
      .from(milestones)
      .where(eq(milestones.id, id))
      .limit(1);
    return row ?? null;
  }

  async updateMilestone(
    tx: Tx,
    id: string,
    patch: Parameters<DeliveryRepository["updateMilestone"]>[2],
  ) {
    await tx.update(milestones).set(patch).where(eq(milestones.id, id));
  }

  async listTasks(tx: Tx, projectId: string): Promise<TaskRow[]> {
    return tx
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        milestoneId: tasks.milestoneId,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        assigneeMembershipId: tasks.assigneeMembershipId,
        dueOn: tasks.dueOn,
        position: tasks.position,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.position), asc(tasks.id));
  }

  async insertTask(tx: Tx, v: Parameters<DeliveryRepository["insertTask"]>[1]) {
    const [{ n } = { n: 0 }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(tasks)
      .where(eq(tasks.projectId, v.projectId));
    const [row] = await tx
      .insert(tasks)
      .values({ ...v, position: n })
      .returning({ id: tasks.id });
    if (!row) throw new Error("No se pudo crear la tarea");
    return row.id;
  }

  async findTask(tx: Tx, id: string): Promise<TaskRow | null> {
    const [row] = await tx
      .select({
        id: tasks.id,
        projectId: tasks.projectId,
        milestoneId: tasks.milestoneId,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        assigneeMembershipId: tasks.assigneeMembershipId,
        dueOn: tasks.dueOn,
        position: tasks.position,
        completedAt: tasks.completedAt,
      })
      .from(tasks)
      .where(eq(tasks.id, id))
      .limit(1);
    return row ?? null;
  }

  async updateTask(tx: Tx, id: string, patch: TaskPatch) {
    await tx
      .update(tasks)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tasks.id, id));
  }

  async deleteTask(tx: Tx, id: string) {
    await tx.delete(timeEntries).where(eq(timeEntries.taskId, id));
    await tx.delete(tasks).where(eq(tasks.id, id));
  }

  async insertTime(tx: Tx, v: Parameters<DeliveryRepository["insertTime"]>[1]) {
    const [row] = await tx.insert(timeEntries).values(v).returning({ id: timeEntries.id });
    if (!row) throw new Error("No se pudo registrar el tiempo");
    return row.id;
  }

  async listTime(tx: Tx, projectId: string, limit: number): Promise<TimeRow[]> {
    return tx
      .select({
        id: timeEntries.id,
        projectId: timeEntries.projectId,
        taskId: timeEntries.taskId,
        membershipId: timeEntries.membershipId,
        minutes: timeEntries.minutes,
        workedOn: timeEntries.workedOn,
        note: timeEntries.note,
      })
      .from(timeEntries)
      .where(eq(timeEntries.projectId, projectId))
      .orderBy(desc(timeEntries.workedOn), desc(timeEntries.createdAt))
      .limit(limit);
  }
}
