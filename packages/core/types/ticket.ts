export type TicketPriority = "critical" | "high" | "normal" | "low";
export type TicketType = "bug" | "question" | "feature_request" | "task" | "support" | "change_request" | "clarification";
export type TicketClientStatus = "open" | "in_progress" | "awaiting_response" | "resolved" | "closed";
export type TicketInternalStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "waiting_on_client"
  | "waiting_on_third_party"
  | "resolved"
  | "closed";
export type TicketSource = "portal" | "email" | "internal";
export type TicketMessageType = "reply" | "note";

export interface Ticket {
  id: string;
  workspace_id: string;
  project_id: string;
  client_id: string;
  number: number;
  identifier: string;
  subject: string;
  description: string;
  type: TicketType;
  priority: TicketPriority;
  client_status: TicketClientStatus;
  internal_status: TicketInternalStatus;
  assignee_type: string | null;
  assignee_id: string | null;
  linked_issue_id: string | null;
  pending_reply: boolean;
  source: TicketSource;
  first_response_at: string | null;
  first_response_due: string | null;
  next_update_due: string | null;
  resolution_due: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  client_name: string;
  client_company: string | null;
  project_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  type: TicketMessageType;
  body: string;
  sender_type: string;
  sender_id: string;
  sender_name: string | null;
  created_at: string;
}

export interface SLAPolicy {
  id: string;
  workspace_id: string;
  name: string;
  critical_first_response: number | null;
  critical_update_interval: number | null;
  critical_resolution: number | null;
  high_first_response: number | null;
  high_update_interval: number | null;
  high_resolution: number | null;
  normal_first_response: number | null;
  normal_update_interval: number | null;
  normal_resolution: number | null;
  low_first_response: number | null;
  low_update_interval: number | null;
  low_resolution: number | null;
  support_hours: string;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  workspace_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  sla_policy_id: string | null;
  sla_policy_name: string | null;
  company_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTicketRequest {
  project_id: string;
  client_id: string;
  subject: string;
  description?: string;
  type?: TicketType;
  priority?: TicketPriority;
  assignee_type?: string;
  assignee_id?: string;
  source?: TicketSource;
}

export interface UpdateTicketRequest {
  subject?: string;
  description?: string;
  type?: TicketType;
  priority?: TicketPriority;
  internal_status?: TicketInternalStatus;
  assignee_type?: string;
  assignee_id?: string;
  linked_issue_id?: string;
}

export interface ListTicketsParams {
  internal_status?: string;
  priority?: string;
  project_id?: string;
  assignee_id?: string;
  client_id?: string;
  limit?: number;
  offset?: number;
}

export interface ListTicketsResponse {
  tickets: Ticket[];
  total: number;
}

export interface SLAMonitor {
  breached: Ticket[];
  at_risk: Ticket[];
}

export interface CreateSLAPolicyRequest {
  name: string;
  critical_first_response?: number;
  critical_update_interval?: number;
  critical_resolution?: number;
  high_first_response?: number;
  high_update_interval?: number;
  high_resolution?: number;
  normal_first_response?: number;
  normal_update_interval?: number;
  normal_resolution?: number;
  low_first_response?: number;
  low_update_interval?: number;
  low_resolution?: number;
  support_hours?: string;
}

export interface CreateClientRequest {
  email: string;
  sla_policy_id?: string;
  company_name?: string;
  project_ids: string[];
}

export interface UpdateClientRequest {
  sla_policy_id?: string;
  company_name?: string;
}
