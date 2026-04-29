import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const workloadKeys = {
  all: (wsId: string) => ["workload", wsId] as const,
  data: (wsId: string) => [...workloadKeys.all(wsId), "data"] as const,
  issues: (wsId: string, assigneeType: string, assigneeId: string) =>
    [...workloadKeys.all(wsId), "issues", assigneeType, assigneeId] as const,
};

export function workloadOptions(wsId: string) {
  return queryOptions({
    queryKey: workloadKeys.data(wsId),
    queryFn: () => api.getWorkload(),
    enabled: !!wsId,
  });
}

export function workloadIssuesOptions(wsId: string, assigneeType: string, assigneeId: string) {
  return queryOptions({
    queryKey: workloadKeys.issues(wsId, assigneeType, assigneeId),
    queryFn: () => api.getWorkloadIssues(assigneeType, assigneeId),
    select: (data) => data.issues,
    enabled: !!wsId && !!assigneeId,
  });
}
