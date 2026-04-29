"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw, MoreHorizontal, Trash2, Pencil } from "lucide-react";
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
  active: { label: "Current", className: "bg-blue-500/15 text-blue-400 border border-blue-500/30" },
  planned: { label: "Planned", className: "bg-muted text-muted-foreground border border-border" },
  cooldown: { label: "Cooldown", className: "bg-orange-500/15 text-orange-400 border border-orange-500/30" },
  completed: { label: "Completed", className: "bg-green-500/15 text-green-400 border border-green-500/30" },
};

function formatDateRange(startsAt: string, endsAt: string) {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(s)} - ${fmt(e)}`;
}

function formatTimelineDate(dateStr: string) {
  const d = new Date(dateStr);
  return { month: d.toLocaleDateString("en-US", { month: "short" }), day: d.getDate().toString() };
}

function CapacityRing({ percent, size = 20 }: { percent: number; size?: number }) {
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(percent, 100) / 100) * c;
  const center = size / 2;
  return (
    <svg className="shrink-0" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={center} cy={center} r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="2" />
      <circle
        cx={center} cy={center} r={r} fill="none"
        stroke="hsl(var(--chart-1))"
        strokeWidth="2"
        strokeDasharray={c}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all -rotate-90 origin-center"
      />
    </svg>
  );
}

function CycleRow({ cycle, teamIdentifier, isLast }: { cycle: Cycle; teamIdentifier: string; isLast: boolean }) {
  const p = useWorkspacePaths();
  const deleteCycle = useDeleteCycle();
  const badge = STATUS_BADGE[cycle.status];
  const isActive = cycle.status === "active";
  const capacity = cycle.issue_count > 0 ? Math.min(Math.round((cycle.issue_count / 20) * 100), 100) : 0;
  const startDate = formatTimelineDate(cycle.starts_at);

  return (
    <div className="relative flex">
      {/* Timeline column */}
      <div className="w-14 shrink-0 flex flex-col items-center relative">
        <div className="text-[10px] text-muted-foreground/70 leading-tight text-center mb-1">
          <div>{startDate.month}</div>
          <div>{startDate.day}</div>
        </div>
        <div className={cn(
          "size-2 rounded-full shrink-0 z-10",
          isActive ? "bg-blue-400" : "bg-muted-foreground/30"
        )} />
        {!isLast && <div className="w-px flex-1 bg-border" />}
      </div>

      {/* Cycle content */}
      <div className="flex-1 pb-6 min-w-0">
        <div className="flex items-center gap-3 h-8">
          <AppLink
            href={p.teamCycleDetail(teamIdentifier, cycle.id)}
            className="flex items-center gap-2 min-w-0 hover:text-foreground transition-colors"
          >
            <RefreshCw className={cn(
              "size-4 shrink-0",
              isActive ? "text-blue-400" : "text-muted-foreground"
            )} />
            <span className="font-medium truncate">{cycle.name}</span>
          </AppLink>

          <div className="ml-auto flex items-center gap-3 shrink-0">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {formatDateRange(cycle.starts_at, cycle.ends_at)}
            </span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full", badge.className)}>
              {badge.label}
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CapacityRing percent={capacity} />
              <span>{capacity}% of capacity</span>
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {cycle.issue_count} scope
            </span>
            <Popover>
              <PopoverTrigger className="rounded p-1 hover:bg-accent transition-colors">
                <MoreHorizontal className="size-4 text-muted-foreground" />
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1" align="end">
                <AppLink
                  href={p.teamCycleDetail(teamIdentifier, cycle.id)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                >
                  <Pencil className="size-3.5" /> Edit cycle
                </AppLink>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-accent transition-colors"
                  onClick={() => deleteCycle.mutate(cycle.id)}
                >
                  <Trash2 className="size-3.5" /> Delete cycle
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Burndown chart for active cycle */}
        {isActive && (
          <div className="mt-4 rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
            <div className="flex">
              <div className="flex-1 p-4">
                <CycleBurndownChart
                  scopeHistory={cycle.scope_history}
                  completedScopeHistory={cycle.completed_scope_history}
                  startedScopeHistory={cycle.started_scope_history}
                  startsAt={cycle.starts_at}
                  endsAt={cycle.ends_at}
                />
              </div>
              <div className="w-44 shrink-0 p-4 flex flex-col justify-center gap-3 border-l border-border/40">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm bg-muted-foreground/50" />
                  <span className="text-xs text-muted-foreground flex-1">Scope</span>
                  <span className="text-xs font-medium tabular-nums">{cycle.issue_count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm bg-amber-400" />
                  <span className="text-xs text-muted-foreground flex-1">Started</span>
                  <span className="text-xs font-medium tabular-nums">-</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-sm bg-blue-500" />
                  <span className="text-xs text-muted-foreground flex-1">Completed</span>
                  <span className="text-xs font-medium tabular-nums">-</span>
                </div>
              </div>
            </div>
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
        <RefreshCw className="size-4 text-muted-foreground" />
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
            <RefreshCw className="size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No cycles yet</p>
            <p className="text-xs text-muted-foreground/70">
              Enable cycles in team settings to auto-create them, or create one manually.
            </p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            {cycles.map((cycle, i) => (
              <CycleRow
                key={cycle.id}
                cycle={cycle}
                teamIdentifier={teamIdentifier}
                isLast={i === cycles.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
