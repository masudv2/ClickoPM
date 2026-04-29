"use client";

import type { TeamHealth, DashboardBlocker } from "@multica/core/types";
import { TeamHealthCard } from "./team-health-card";

interface TeamHealthGridProps {
  teams: TeamHealth[];
  blockers: DashboardBlocker[];
}

export function TeamHealthGrid({ teams, blockers }: TeamHealthGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {teams.map((team) => (
        <TeamHealthCard key={team.team_id} team={team} blockers={blockers} />
      ))}
    </div>
  );
}
