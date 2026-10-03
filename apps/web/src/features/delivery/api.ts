import type { ProjectDetailDto, ProjectDto } from "@nexo/contracts";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../shared/api/client";

export const delivery = {
  all: ["delivery"] as const,
  projects: (accountId?: string) => ["delivery", "projects", accountId ?? ""] as const,
  project: (id: string) => ["delivery", "project", id] as const,
};

export const useProjects = (accountId?: string) =>
  useQuery({
    queryKey: delivery.projects(accountId),
    queryFn: () =>
      api<ProjectDto[]>(`/delivery/projects${accountId ? `?accountId=${accountId}` : ""}`),
  });

export const useProject = (id: string) =>
  useQuery({
    queryKey: delivery.project(id),
    queryFn: () => api<ProjectDetailDto>(`/delivery/projects/${id}`),
  });

export const HEALTH_TONE = { on_track: "success", at_risk: "warning", off_track: "error" } as const;
export const STATUS_TONE = {
  planned: "neutral",
  in_progress: "info",
  at_risk: "warning",
  blocked: "error",
  done: "success",
  cancelled: "neutral",
} as const;
