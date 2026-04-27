export interface Team {
  id: string;
  workspace_id: string;
  name: string;
  identifier: string;
  icon: string | null;
  color: string;
  timezone: string;
  settings: TeamSettings;
  position: number;
  created_at: string;
  updated_at: string;
  issue_count: number;
  member_count: number;
}

export interface TeamSettings {
  estimates?: {
    enabled: boolean;
    scale: "not_in_use" | "fibonacci" | "linear" | "tshirt";
  };
  cycles?: {
    enabled: boolean;
    duration_weeks: number;
    cooldown_weeks: number;
    start_day: string;
    auto_create_count: number;
    auto_add_started: boolean;
    auto_add_completed: boolean;
  };
  slack?: {
    channel_id: string | null;
    notifications: Record<string, boolean>;
  };
}

export interface TeamMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string;
  name: string;
  email: string;
  avatar_url: string | null;
}

export interface CreateTeamRequest {
  name: string;
  identifier: string;
  icon?: string;
  color?: string;
}

export interface UpdateTeamRequest {
  name?: string;
  identifier?: string;
  icon?: string;
  color?: string;
  timezone?: string;
  settings?: Partial<TeamSettings>;
  position?: number;
}

export interface ListTeamsResponse {
  teams: Team[];
}

export interface ListTeamMembersResponse {
  members: TeamMember[];
}
