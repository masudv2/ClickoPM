import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const milestoneKeys = {
  all: (wsId: string) => ["milestones", wsId] as const,
  byProject: (wsId: string, projectId: string) =>
    [...milestoneKeys.all(wsId), "project", projectId] as const,
  detail: (wsId: string, id: string) =>
    [...milestoneKeys.all(wsId), id] as const,
};

export function projectMilestonesOptions(wsId: string, projectId: string) {
  return queryOptions({
    queryKey: milestoneKeys.byProject(wsId, projectId),
    queryFn: () => api.listMilestones(projectId).then((r) => r.milestones),
    enabled: !!projectId,
  });
}

export function milestoneDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: milestoneKeys.detail(wsId, id),
    queryFn: () => api.getMilestone(id),
    enabled: !!id,
  });
}
