"use client";

import { useQuery } from "@tanstack/react-query";
import { Timer, MoreHorizontal, Play, Trash2, Pencil } from "lucide-react";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { teamListOptions } from "@multica/core/teams";
import { cycleListOptions } from "@multica/core/cycles/queries";
import { useDeleteCycle } from "@multica/core/cycles/mutations";
import type { Cycle, CycleStatus } from "@multica/core/types";
import { cn } from "@multica/ui/lib/utils";
import { Popover, PopoverTrigger, PopoverContent } from "@multica/ui/components/ui/popover";
import { AppLink } from "../../navigation";
import { CycleBurndownChart } from "./cycle-burndown-chart";

const STATUS_BADGE: Record<CycleStatus, { label: string; className: string }> = {
  active: { label: "Current", className: "bg-blue-500/15 text-blue-400" },
  planned: { label: "Upcoming", className: "bg-muted text-muted-foreground" },
  cooldown: { label: "Cooldown", className: "bg-orange-500/15 text-orange-400" },
  completed: { label: "Completed", className: "bg-green-500/15 text-green-400" },
};

function formatDateRange(startsAt: string, endsAt: string) {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(s)} - ${fmt(e)}`;
}

function CycleRow({ cycle, teamIdentifier }: { cycle: Cycle; teamIdentifier: string }) {
  const p = useWorkspacePaths();
  const deleteCycle = useDeleteCycle();
  const badge = STATUS_BADGE[cycle.status];
  const isActive = cycle.status === "active";

  return (
    <div className="relative pl-6">
      <div className="absolute left-2 top-0 bottom-0 w-px bg-border" />
      <div className="absolute left-[5px] top-3 size-2.5 rounded-full bg-border" />

      <div className="py-2">
        <div className="flex items-center gap-3">
          <AppLink
            href={p.teamCycleDetail(teamIdentifier, cycle.id)}
            className="flex items-center gap-2 flex-1 min-w-0 hover:text-foreground transition-colors"
          >
            <Play className="size-3.5 text-muted-foreground shrink-0" />
            <span className="font-medium truncate">{cycle.name}</span>
          </AppLink>

          <span className="text-xs text-muted-foreground shrink-0">
            {formatDateRange(cycle.starts_at, cycle.ends_at)}
          </span>

          <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0", badge.className)}>
            {badge.label}
          </span>

          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            {cycle.issue_count} scope
          </span>

          <Popover>
            <PopoverTrigger className="rounded p-1 hover:bg-accent transition-colors">
              <MoreHorizontal className="size-4" />
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              <AppLink
                href={p.teamCycleDetail(teamIdentifier, cycle.id)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
              >
                <Pencil className="size-4" /> Edit cycle
              </AppLink>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-accent transition-colors"
                onClick={() => deleteCycle.mutate(cycle.id)}
              >
                <Trash2 className="size-4" /> Delete cycle
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {isActive && cycle.scope_history.length > 0 && (
          <div className="mt-3 rounded-lg border p-3">
            <CycleBurndownChart
              scopeHistory={cycle.scope_history}
              completedScopeHistory={cycle.completed_scope_history}
              startedScopeHistory={cycle.started_scope_history}
              startsAt={cycle.starts_at}
              endsAt={cycle.ends_at}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export function CyclesListPage({ teamIdentifier }: { teamIdentifier: string }) {
  const wsId = useWorkspaceId();
  const { data: teams = [] } = useQuery({ ...teamListOptions(wsId), enabled: !!teamIdentifier });
  const team = teams.find((t) => t.identifier.toLowerCase() === teamIdentifier.toLowerCase());
  const teamId = team?.id ?? "";

  const { data: cycles = [], isLoading } = useQuery(cycleListOptions(wsId, teamId));

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-2 border-b px-6 py-3">
        <Timer className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">
          {team?.name ? `${team.name} Cycles` : "Cycles"}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Loading cycles...
          </div>
        ) : cycles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Timer className="size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">No cycles yet</p>
            <p className="text-xs text-muted-foreground/70">
              Enable cycles in team settings to auto-create them, or create one manually.
            </p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {cycles.map((cycle) => (
              <CycleRow key={cycle.id} cycle={cycle} teamIdentifier={teamIdentifier} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
