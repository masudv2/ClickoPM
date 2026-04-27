import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const labelKeys = {
  all: (wsId: string) => ["labels", wsId] as const,
  list: (wsId: string) => [...labelKeys.all(wsId), "list"] as const,
};

export function labelListOptions(wsId: string) {
  return queryOptions({
    queryKey: labelKeys.list(wsId),
    queryFn: () => api.listLabels(),
    select: (data) => data.labels,
  });
}
