import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const cycleKeys = {
  all: (wsId: string) => ["cycles", wsId] as const,
  list: (wsId: string, teamId: string) => [...cycleKeys.all(wsId), "list", teamId] as const,
  detail: (wsId: string, id: string) => [...cycleKeys.all(wsId), id] as const,
  active: (wsId: string, teamId: string) => [...cycleKeys.all(wsId), "active", teamId] as const,
};

export function cycleListOptions(wsId: string, teamId: string) {
  return queryOptions({
    queryKey: cycleKeys.list(wsId, teamId),
    queryFn: () => api.listCycles(teamId),
    select: (data) => data.cycles,
    enabled: !!teamId,
  });
}

export function cycleDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: cycleKeys.detail(wsId, id),
    queryFn: () => api.getCycle(id),
    enabled: !!id,
  });
}

export function activeCycleOptions(wsId: string, teamId: string) {
  return queryOptions({
    queryKey: cycleKeys.active(wsId, teamId),
    queryFn: () => api.getActiveCycle(teamId),
    enabled: !!teamId,
  });
}
