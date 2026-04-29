export type CycleStatus = "planned" | "active" | "cooldown" | "completed";

export interface HistoryEntry {
  date: string;
  count: number;
  points: number;
}

export interface ScopeStats {
  count: number;
  points: number;
  percent?: number;
}

export interface BreakdownItem {
  id?: string;
  actor_type?: string;
  name?: string;
  priority?: string;
  icon?: string;
  total_count: number;
  total_points: number;
  completed_count: number;
  completed_points: number;
  percent: number;
  velocity?: number;
  capacity_percent?: number;
}

export interface LabelBreakdownItem {
  label_id: string;
  name: string;
  color: string;
  total_count: number;
  total_points: number;
  completed_count: number;
  completed_points: number;
  percent: number;
}

export interface Cycle {
  id: string;
  workspace_id: string;
  team_id: string;
  name: string;
  description: string | null;
  number: number;
  status: CycleStatus;
  starts_at: string;
  ends_at: string;
  cooldown_ends_at: string | null;
  completed_at: string | null;
  scope_history: HistoryEntry[];
  completed_scope_history: HistoryEntry[];
  started_scope_history: HistoryEntry[];
  position: number;
  created_at: string;
  updated_at: string;
  issue_count: number;
}

export interface CycleWithProgress extends Cycle {
  scope: ScopeStats;
  started: ScopeStats;
  completed: ScopeStats;
  success: number;
  velocity: number;
  capacity_percent: number;
  scope_creep: number;
  assignee_breakdown: BreakdownItem[];
  label_breakdown: LabelBreakdownItem[];
  priority_breakdown: BreakdownItem[];
  project_breakdown: BreakdownItem[];
}

export interface CreateCycleRequest {
  name: string;
  description?: string;
  starts_at: string;
  ends_at: string;
}

export interface UpdateCycleRequest {
  name?: string;
  description?: string;
  starts_at?: string;
  ends_at?: string;
}

export interface ListCyclesResponse {
  cycles: Cycle[];
}
