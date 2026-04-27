import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { labelKeys } from "./queries";
import { issueKeys } from "../issues/queries";
import { useWorkspaceId } from "../hooks";
import type { CreateLabelRequest, UpdateLabelRequest, ListLabelsResponse } from "../types";

export function useCreateLabel() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateLabelRequest) => api.createLabel(data),
    onSuccess: (newLabel) => {
      qc.setQueryData<ListLabelsResponse>(labelKeys.list(wsId), (old) =>
        old ? { labels: [...old.labels, newLabel] } : { labels: [newLabel] },
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: labelKeys.list(wsId) });
    },
  });
}

export function useUpdateLabel() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateLabelRequest) =>
      api.updateLabel(id, data),
    onMutate: ({ id, ...data }) => {
      qc.cancelQueries({ queryKey: labelKeys.list(wsId) });
      const prev = qc.getQueryData<ListLabelsResponse>(labelKeys.list(wsId));
      qc.setQueryData<ListLabelsResponse>(labelKeys.list(wsId), (old) =>
        old ? { labels: old.labels.map((l) => (l.id === id ? { ...l, ...data } : l)) } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(labelKeys.list(wsId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: labelKeys.list(wsId) });
    },
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteLabel(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: labelKeys.list(wsId) });
      const prev = qc.getQueryData<ListLabelsResponse>(labelKeys.list(wsId));
      qc.setQueryData<ListLabelsResponse>(labelKeys.list(wsId), (old) =>
        old ? { labels: old.labels.filter((l) => l.id !== id) } : old,
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(labelKeys.list(wsId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: labelKeys.list(wsId) });
    },
  });
}

export function useSetIssueLabels() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ issueId, labelIds }: { issueId: string; labelIds: string[] }) =>
      api.setIssueLabels(issueId, labelIds),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: issueKeys.detail(wsId, vars.issueId) });
      qc.invalidateQueries({ queryKey: issueKeys.list(wsId) });
    },
  });
}
