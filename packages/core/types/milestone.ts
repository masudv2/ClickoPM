export type MilestoneDerivedStatus = "planned" | "in_progress" | "completed";

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  target_date: string | null;
  position: number;
  total_count: number;
  done_count: number;
  started_count: number;
  percent: number;
  derived_status: MilestoneDerivedStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateMilestoneRequest {
  name: string;
  description?: string | null;
  start_date?: string | null;
  target_date?: string | null;
  position?: number;
}

export interface UpdateMilestoneRequest {
  name?: string;
  description?: string | null;
  start_date?: string | null;
  target_date?: string | null;
  position?: number;
}

export interface ListMilestonesResponse {
  milestones: Milestone[];
}
