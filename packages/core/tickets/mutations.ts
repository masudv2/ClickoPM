import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import { ticketKeys, clientKeys, slaPolicyKeys, portalKeys } from "./queries";
import type { CreateTicketRequest, UpdateTicketRequest, CreateSLAPolicyRequest, CreateClientRequest, UpdateClientRequest } from "../types";

// Tickets

export function useCreateTicket() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateTicketRequest) => api.createTicket(data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all(wsId) });
    },
  });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateTicketRequest) => api.updateTicket(id, data),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(wsId, vars.id) });
      qc.invalidateQueries({ queryKey: ticketKeys.all(wsId) });
    },
  });
}

export function useDeleteTicket() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteTicket(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ticketKeys.all(wsId) });
    },
  });
}

export function useCreateTicketReply() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: string; body: string }) => api.createTicketReply(ticketId, body),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ticketKeys.messages(wsId, vars.ticketId) });
      qc.invalidateQueries({ queryKey: ticketKeys.detail(wsId, vars.ticketId) });
    },
  });
}

export function useCreateTicketNote() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: string; body: string }) => api.createTicketNote(ticketId, body),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ticketKeys.messages(wsId, vars.ticketId) });
    },
  });
}

// Clients

export function useCreateClient() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateClientRequest) => api.createClient(data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: clientKeys.all(wsId) });
    },
  });
}

export function useUpdateClient() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateClientRequest) => api.updateClient(id, data),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: clientKeys.detail(wsId, vars.id) });
      qc.invalidateQueries({ queryKey: clientKeys.all(wsId) });
    },
  });
}

export function useDeleteClient() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteClient(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: clientKeys.all(wsId) });
    },
  });
}

// SLA Policies

export function useCreateSLAPolicy() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateSLAPolicyRequest) => api.createSLAPolicy(data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: slaPolicyKeys.all(wsId) });
    },
  });
}

export function useUpdateSLAPolicy() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & CreateSLAPolicyRequest) => api.updateSLAPolicy(id, data),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: slaPolicyKeys.detail(wsId, vars.id) });
      qc.invalidateQueries({ queryKey: slaPolicyKeys.all(wsId) });
    },
  });
}

export function useDeleteSLAPolicy() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteSLAPolicy(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: slaPolicyKeys.all(wsId) });
    },
  });
}

// Ticket-Issue linking

export function useLinkIssueToTicket() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ ticketId, issueId }: { ticketId: string; issueId: string }) =>
      api.linkIssueToTicket(ticketId, issueId),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(wsId, vars.ticketId) });
    },
  });
}

export function useCreateIssueFromTicket() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ ticketId, teamId }: { ticketId: string; teamId: string }) =>
      api.createIssueFromTicket(ticketId, teamId),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ticketKeys.detail(wsId, vars.ticketId) });
    },
  });
}

// Portal mutations

export function useCreatePortalTicket() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateTicketRequest) => api.createPortalTicket(data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: portalKeys.tickets(wsId) });
    },
  });
}

export function useCreatePortalReply() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ ticketId, body }: { ticketId: string; body: string }) =>
      api.createPortalTicketReply(ticketId, body),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: portalKeys.messages(wsId, vars.ticketId) });
      qc.invalidateQueries({ queryKey: portalKeys.ticket(wsId, vars.ticketId) });
    },
  });
}

export function useResolvePortalTicket() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.resolvePortalTicket(id),
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: portalKeys.ticket(wsId, id) });
      qc.invalidateQueries({ queryKey: portalKeys.tickets(wsId) });
    },
  });
}

export function useReopenPortalTicket() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.reopenPortalTicket(id),
    onSettled: (_data, _err, id) => {
      qc.invalidateQueries({ queryKey: portalKeys.ticket(wsId, id) });
      qc.invalidateQueries({ queryKey: portalKeys.tickets(wsId) });
    },
  });
}

export function useInviteTeammate() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (email: string) => api.invitePortalTeammate(email),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: clientKeys.all(wsId) });
    },
  });
}
