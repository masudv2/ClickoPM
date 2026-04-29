export type ProjectStatus = "planned" | "in_progress" | "paused" | "completed" | "cancelled";

export type ProjectPriority = "urgent" | "high" | "medium" | "low" | "none";

export interface Project {
  id: string;
  workspace_id: string;
  team_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  lead_type: "member" | "agent" | null;
  lead_id: string | null;
  start_date: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
  issue_count: number;
  done_count: number;
}

export type ProjectHealthStatus = "on_track" | "at_risk" | "behind";

export interface RoadmapProject extends Project {
  health_status: ProjectHealthStatus;
}

export interface ListRoadmapProjectsResponse {
  projects: RoadmapProject[];
}

export interface CreateProjectRequest {
  title: string;
  description?: string;
  icon?: string;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  lead_type?: "member" | "agent";
  lead_id?: string;
  team_id?: string;
  start_date?: string;
  target_date?: string;
}

export interface UpdateProjectRequest {
  title?: string;
  description?: string | null;
  icon?: string | null;
  status?: ProjectStatus;
  priority?: ProjectPriority;
  lead_type?: "member" | "agent" | null;
  lead_id?: string | null;
  start_date?: string | null;
  target_date?: string | null;
}

export interface ListProjectsResponse {
  projects: Project[];
  total: number;
}
