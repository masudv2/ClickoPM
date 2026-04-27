import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { cycleKeys } from "./queries";
import type { CreateCycleRequest, UpdateCycleRequest } from "../types";

export function useCreateCycle() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ teamId, ...data }: { teamId: string } & CreateCycleRequest) =>
      api.createCycle(teamId, data),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: cycleKeys.list(wsId, vars.teamId) });
    },
  });
}

export function useUpdateCycle() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateCycleRequest) =>
      api.updateCycle(id, data),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: cycleKeys.detail(wsId, vars.id) });
      qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) });
    },
  });
}

export function useDeleteCycle() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteCycle(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) });
    },
  });
}

export function useStartCycle() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.startCycle(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) });
    },
  });
}

export function useCompleteCycle() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.completeCycle(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) });
    },
  });
}
