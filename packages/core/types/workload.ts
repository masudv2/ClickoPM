export interface WorkloadMember {
  assignee_type: "member" | "agent";
  assignee_id: string;
  issue_count: number;
  assigned_points: number;
  completed_issue_count: number;
  completed_points: number;
  capacity: number;
  capacity_percent: number;
}

export interface WorkloadTeam {
  team_id: string;
  team_name: string;
  team_color: string;
  team_identifier: string;
  cycle_id: string;
  cycle_name: string;
  cycle_number: number;
  cycle_starts_at: string;
  cycle_ends_at: string;
  members: WorkloadMember[];
}

export interface WorkloadIssue {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  estimate: number | null;
  team_id: string;
}

export interface WorkloadData {
  teams: WorkloadTeam[];
}
