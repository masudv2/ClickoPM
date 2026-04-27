import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const teamKeys = {
  all: (wsId: string) => ["teams", wsId] as const,
  list: (wsId: string) => [...teamKeys.all(wsId), "list"] as const,
  detail: (wsId: string, id: string) => [...teamKeys.all(wsId), id] as const,
  members: (teamId: string) => ["teams", teamId, "members"] as const,
};

export function teamListOptions(wsId: string) {
  return queryOptions({
    queryKey: teamKeys.list(wsId),
    queryFn: () => api.listTeams(),
    select: (data) => data.teams,
  });
}

export function teamDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: teamKeys.detail(wsId, id),
    queryFn: () => api.getTeam(id),
    enabled: !!id,
  });
}

export function teamMemberListOptions(teamId: string) {
  return queryOptions({
    queryKey: teamKeys.members(teamId),
    queryFn: () => api.listTeamMembers(teamId),
    select: (data) => data.members,
    enabled: !!teamId,
  });
}
