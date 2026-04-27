import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { teamKeys } from "./queries";
import { useWorkspaceId } from "../hooks";
import type { CreateTeamRequest, UpdateTeamRequest, ListTeamsResponse } from "../types";

export function useCreateTeam() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateTeamRequest) => api.createTeam(data),
    onSuccess: (newTeam) => {
      qc.setQueryData<ListTeamsResponse>(teamKeys.list(wsId), (old) =>
        old ? { teams: [...old.teams, newTeam] } : { teams: [newTeam] },
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: teamKeys.list(wsId) });
    },
  });
}

export function useUpdateTeam() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateTeamRequest) =>
      api.updateTeam(id, data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: teamKeys.all(wsId) });
    },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteTeam(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: teamKeys.list(wsId) });
      const prev = qc.getQueryData<ListTeamsResponse>(teamKeys.list(wsId));
      qc.setQueryData<ListTeamsResponse>(teamKeys.list(wsId), (old) =>
        old ? { teams: old.teams.filter((t) => t.id !== id) } : old,
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(teamKeys.list(wsId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: teamKeys.list(wsId) });
    },
  });
}

export function useAddTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, memberId }: { teamId: string; memberId: string }) =>
      api.addTeamMember(teamId, memberId),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: teamKeys.members(vars.teamId) });
    },
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, memberId }: { teamId: string; memberId: string }) =>
      api.removeTeamMember(teamId, memberId),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: teamKeys.members(vars.teamId) });
    },
  });
}
