import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import type { Milestone, CreateMilestoneRequest, UpdateMilestoneRequest } from "../types";
import { milestoneKeys } from "./queries";
import { issueKeys } from "../issues/queries";
import { cycleKeys } from "../cycles/queries";

export function useCreateMilestone(projectId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateMilestoneRequest) => api.createMilestone(projectId, data),
    onSuccess: (created) => {
      qc.setQueryData<Milestone[]>(milestoneKeys.byProject(wsId, projectId), (old) => {
        if (!old) return [created];
        return [...old, created];
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: milestoneKeys.byProject(wsId, projectId) });
    },
  });
}

export function useUpdateMilestone() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateMilestoneRequest) =>
      api.updateMilestone(id, data),
    onMutate: ({ id, ...data }) => {
      qc.cancelQueries({ queryKey: milestoneKeys.all(wsId) });
      const lists = qc.getQueriesData<Milestone[]>({ queryKey: milestoneKeys.all(wsId) });
      const prev = new Map<string, Milestone[]>();
      for (const [key, cache] of lists) {
        if (!cache) continue;
        prev.set(JSON.stringify(key), cache);
        qc.setQueryData<Milestone[]>(
          key,
          cache.map((m) => (m.id === id ? { ...m, ...data } : m)),
        );
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        for (const [k, v] of ctx.prev) qc.setQueryData(JSON.parse(k), v);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: milestoneKeys.all(wsId) });
    },
  });
}

export function useDeleteMilestone(projectId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteMilestone(id),
    onMutate: (id) => {
      qc.cancelQueries({ queryKey: milestoneKeys.byProject(wsId, projectId) });
      const prev = qc.getQueryData<Milestone[]>(milestoneKeys.byProject(wsId, projectId));
      qc.setQueryData<Milestone[]>(milestoneKeys.byProject(wsId, projectId), (old) =>
        old?.filter((m) => m.id !== id),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(milestoneKeys.byProject(wsId, projectId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: milestoneKeys.all(wsId) });
      qc.invalidateQueries({ queryKey: issueKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) });
    },
  });
}

export function useReorderMilestones(projectId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ ids, positions }: { ids: string[]; positions: number[] }) =>
      api.reorderMilestones(projectId, ids, positions),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: milestoneKeys.byProject(wsId, projectId) });
    },
  });
}
