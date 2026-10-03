import type { Tx } from "../../../platform/db/database";

export interface ProjectRow {
  id: string;
  name: string;
  status: string;
  health: string;
  accountId: string | null;
  accountName: string | null;
  accountArchived: boolean;
  sourceDealId: string | null;
  ownerMembershipId: string | null;
  startsOn: string | null;
  dueOn: string | null;
  summary: string | null;
  tasksTotal: number;
  tasksDone: number;
  tasksOverdue: number;
  minutesLogged: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface MilestoneRow {
  id: string;
  projectId: string;
  name: string;
  dueOn: string | null;
  status: string;
  position: number;
}

export interface TaskRow {
  id: string;
  projectId: string;
  milestoneId: string | null;
  title: string;
  description: string | null;
  status: string;
  assigneeMembershipId: string | null;
  dueOn: string | null;
  position: number;
  completedAt: Date | null;
}

export interface TimeRow {
  id: string;
  projectId: string;
  taskId: string | null;
  membershipId: string | null;
  minutes: number;
  workedOn: string;
  note: string | null;
}

export interface MemberDirectory {
  names(tx: Tx, membershipIds: string[]): Promise<Map<string, string>>;
  isActiveMember(tx: Tx, membershipId: string): Promise<boolean>;
}

export type ProjectPatch = Partial<{
  name: string;
  status: string;
  health: string;
  ownerMembershipId: string | null;
  startsOn: string | null;
  dueOn: string | null;
  summary: string | null;
}>;
export type TaskPatch = Partial<{
  title: string;
  description: string | null;
  status: string;
  milestoneId: string | null;
  assigneeMembershipId: string | null;
  dueOn: string | null;
  completedAt: Date | null;
}>;

/** Persistencia de Delivery (la implementa `infrastructure/`). Todo dentro de `withTenant`. */
export interface DeliveryRepository {
  insertProject(
    tx: Tx,
    v: {
      tenantId: string;
      name: string;
      status: string;
      accountId: string | null;
      accountName: string | null;
      sourceDealId: string | null;
      ownerMembershipId: string | null;
      startsOn: string | null;
      dueOn: string | null;
      summary: string | null;
    },
  ): Promise<string>;
  findProject(tx: Tx, id: string, today: string): Promise<ProjectRow | null>;
  findProjectByDeal(tx: Tx, dealId: string, today: string): Promise<ProjectRow | null>;
  listProjects(
    tx: Tx,
    f: {
      accountId?: string | undefined;
      status?: string | undefined;
      limit: number;
      today: string;
    },
  ): Promise<ProjectRow[]>;
  updateProject(tx: Tx, id: string, patch: ProjectPatch): Promise<void>;
  syncAccountName(tx: Tx, accountId: string, name: string): Promise<void>;
  archiveAccount(tx: Tx, accountId: string): Promise<void>;

  listMilestones(tx: Tx, projectId: string): Promise<MilestoneRow[]>;
  insertMilestone(
    tx: Tx,
    v: { tenantId: string; projectId: string; name: string; dueOn: string | null },
  ): Promise<string>;
  findMilestone(tx: Tx, id: string): Promise<MilestoneRow | null>;
  updateMilestone(
    tx: Tx,
    id: string,
    patch: Partial<{ name: string; dueOn: string | null; status: string }>,
  ): Promise<void>;

  listTasks(tx: Tx, projectId: string): Promise<TaskRow[]>;
  insertTask(
    tx: Tx,
    v: {
      tenantId: string;
      projectId: string;
      milestoneId: string | null;
      title: string;
      description: string | null;
      assigneeMembershipId: string | null;
      dueOn: string | null;
    },
  ): Promise<string>;
  findTask(tx: Tx, id: string): Promise<TaskRow | null>;
  updateTask(tx: Tx, id: string, patch: TaskPatch): Promise<void>;
  deleteTask(tx: Tx, id: string): Promise<void>;

  insertTime(
    tx: Tx,
    v: {
      tenantId: string;
      projectId: string;
      taskId: string | null;
      membershipId: string | null;
      minutes: number;
      workedOn: string;
      note: string | null;
    },
  ): Promise<string>;
  listTime(tx: Tx, projectId: string, limit: number): Promise<TimeRow[]>;
}
