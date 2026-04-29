"use client";

import type { TeamHealth } from "@multica/core/types";
import { Card, CardContent, CardHeader, CardTitle } from "@multica/ui/components/ui/card";
import { TEAM_CHART_COLORS } from "./team-colors";

interface WorkloadSectionProps {
  teams: TeamHealth[];
}

export function WorkloadSection({ teams }: WorkloadSectionProps) {
  const teamsWithCycles = teams.filter((t) => t.active_cycle);

  if (teamsWithCycles.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-32 items-center justify-center">
          <p className="text-sm text-muted-foreground">No active cycles to show workload</p>
        </CardContent>
      </Card>
    );
  }

  const maxScope = Math.max(...teamsWithCycles.map((t) => t.active_cycle!.scope_count), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Workload by Team</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {teamsWithCycles.map((team) => {
          const cycle = team.active_cycle!;
          const completed = cycle.completed_count;
          const remaining = cycle.scope_count - completed;
          const completedPct = (completed / maxScope) * 100;
          const remainingPct = (remaining / maxScope) * 100;
          const hex = TEAM_CHART_COLORS[team.team_color] ?? "#3b82f6";

          return (
            <div key={team.team_id} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{team.team_name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {completed}/{cycle.scope_count} done
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="rounded-l-full transition-all"
                  style={{ width: `${completedPct}%`, backgroundColor: hex }}
                />
                <div
                  className="transition-all"
                  style={{ width: `${remainingPct}%`, backgroundColor: hex, opacity: 0.2 }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
