import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const dashboardKeys = {
  all: (wsId: string) => ["dashboard", wsId] as const,
  data: (wsId: string, cycleCount: number) => [...dashboardKeys.all(wsId), cycleCount] as const,
};

export function dashboardOptions(wsId: string, cycleCount: number = 6) {
  return queryOptions({
    queryKey: dashboardKeys.data(wsId, cycleCount),
    queryFn: () => api.getDashboard(cycleCount),
    enabled: !!wsId,
  });
}
