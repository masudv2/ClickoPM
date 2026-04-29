import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";
import type { ListTicketsParams } from "../types";

export const ticketKeys = {
  all: (wsId: string) => ["tickets", wsId] as const,
  list: (wsId: string, params?: ListTicketsParams) => [...ticketKeys.all(wsId), "list", params] as const,
  detail: (wsId: string, id: string) => [...ticketKeys.all(wsId), id] as const,
  messages: (wsId: string, id: string) => [...ticketKeys.all(wsId), id, "messages"] as const,
  slaMonitor: (wsId: string) => [...ticketKeys.all(wsId), "sla-monitor"] as const,
};

export const clientKeys = {
  all: (wsId: string) => ["clients", wsId] as const,
  list: (wsId: string) => [...clientKeys.all(wsId), "list"] as const,
  detail: (wsId: string, id: string) => [...clientKeys.all(wsId), id] as const,
};

export const slaPolicyKeys = {
  all: (wsId: string) => ["sla-policies", wsId] as const,
  list: (wsId: string) => [...slaPolicyKeys.all(wsId), "list"] as const,
  detail: (wsId: string, id: string) => [...slaPolicyKeys.all(wsId), id] as const,
};

export function ticketListOptions(wsId: string, params?: ListTicketsParams) {
  return queryOptions({
    queryKey: ticketKeys.list(wsId, params),
    queryFn: () => api.listTickets(params),
  });
}

export function ticketDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: ticketKeys.detail(wsId, id),
    queryFn: () => api.getTicket(id),
    enabled: !!id,
  });
}

export function ticketMessagesOptions(wsId: string, ticketId: string) {
  return queryOptions({
    queryKey: ticketKeys.messages(wsId, ticketId),
    queryFn: () => api.listTicketMessages(ticketId),
    enabled: !!ticketId,
  });
}

export function slaMonitorOptions(wsId: string) {
  return queryOptions({
    queryKey: ticketKeys.slaMonitor(wsId),
    queryFn: () => api.getSLAMonitor(),
  });
}

export function clientListOptions(wsId: string) {
  return queryOptions({
    queryKey: clientKeys.list(wsId),
    queryFn: () => api.listClients(),
  });
}

export function clientDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: clientKeys.detail(wsId, id),
    queryFn: () => api.getClient(id),
    enabled: !!id,
  });
}

export function slaPolicyListOptions(wsId: string) {
  return queryOptions({
    queryKey: slaPolicyKeys.list(wsId),
    queryFn: () => api.listSLAPolicies(),
  });
}

export function slaPolicyDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: slaPolicyKeys.detail(wsId, id),
    queryFn: () => api.getSLAPolicy(id),
    enabled: !!id,
  });
}

// Portal (client-facing) queries

export const portalKeys = {
  all: (wsId: string) => ["portal", wsId] as const,
  tickets: (wsId: string) => [...portalKeys.all(wsId), "tickets"] as const,
  ticket: (wsId: string, id: string) => [...portalKeys.all(wsId), "ticket", id] as const,
  messages: (wsId: string, id: string) => [...portalKeys.all(wsId), "messages", id] as const,
  projects: (wsId: string) => [...portalKeys.all(wsId), "projects"] as const,
};

export function portalTicketListOptions(wsId: string) {
  return queryOptions({
    queryKey: portalKeys.tickets(wsId),
    queryFn: () => api.listPortalTickets(),
  });
}

export function portalTicketDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: portalKeys.ticket(wsId, id),
    queryFn: () => api.getPortalTicket(id),
    enabled: !!id,
  });
}

export function portalTicketMessagesOptions(wsId: string, ticketId: string) {
  return queryOptions({
    queryKey: portalKeys.messages(wsId, ticketId),
    queryFn: () => api.listPortalTicketMessages(ticketId),
    enabled: !!ticketId,
  });
}

export function portalProjectListOptions(wsId: string) {
  return queryOptions({
    queryKey: portalKeys.projects(wsId),
    queryFn: () => api.listPortalProjects(),
  });
}
