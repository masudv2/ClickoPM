export interface DashboardStats {
  open_count: number;
  overdue_count: number;
  completion_rate: number;
  avg_velocity: number;
}

export interface CycleSummary {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  scope_count: number;
  scope_points: number;
  completed_count: number;
  completed_points: number;
  scope_history: Array<{ date: string; count: number; points: number }>;
  completed_scope_history: Array<{ date: string; count: number; points: number }>;
}

export interface TeamHealth {
  team_id: string;
  team_name: string;
  team_color: string;
  team_identifier: string;
  active_cycle: CycleSummary | null;
  velocity: number;
  blocker_count: number;
  estimates_enabled: boolean;
}

export interface VelocityDataPoint {
  team_id: string;
  team_name: string;
  team_color: string;
  cycle_name: string;
  cycle_number: number;
  starts_at: string;
  ends_at: string;
  count: number;
  points: number;
  committed: number;
  unplanned: number;
  removed: number;
}

export interface DashboardBlocker {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  assignee_type: string | null;
  assignee_id: string | null;
  due_date: string | null;
  team_id: string;
  team_name: string;
  team_color: string;
}

export interface DashboardActivity {
  id: string;
  issue_id: string | null;
  actor_type: string;
  actor_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface DashboardData {
  stats: DashboardStats;
  teams: TeamHealth[];
  velocity: VelocityDataPoint[];
  activity: DashboardActivity[];
  blockers: DashboardBlocker[];
}
