"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Timer, ChevronLeft } from "lucide-react";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { teamListOptions } from "@multica/core/teams";
import { cycleDetailOptions } from "@multica/core/cycles/queries";
import { issueListOptions } from "@multica/core/issues/queries";
import type { CycleWithProgress, CycleStatus } from "@multica/core/types";
import { cn } from "@multica/ui/lib/utils";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { AppLink } from "../../navigation";
import { StatusIcon } from "../../issues/components/status-icon";
import { PriorityIcon } from "../../issues/components/priority-icon";
import { CycleSidebar } from "./cycle-sidebar";

const STATUS_BADGE: Record<CycleStatus, { label: string; className: string }> = {
  active: { label: "Current", className: "bg-blue-500/15 text-blue-400" },
  planned: { label: "Upcoming", className: "bg-muted text-muted-foreground" },
  cooldown: { label: "Cooldown", className: "bg-orange-500/15 text-orange-400" },
  completed: { label: "Completed", className: "bg-green-500/15 text-green-400" },
};

export function CycleDetailPage({ cycleId, teamIdentifier }: { cycleId: string; teamIdentifier: string }) {
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const { data: teams = [] } = useQuery({ ...teamListOptions(wsId), enabled: !!teamIdentifier });
  const team = teams.find((t) => t.identifier.toLowerCase() === teamIdentifier.toLowerCase());
  const teamId = team?.id ?? "";

  const { data: cycle, isLoading } = useQuery(cycleDetailOptions(wsId, cycleId));
  const { data: allIssues = [] } = useQuery(issueListOptions(wsId, teamId));

  const cycleIssues = useMemo(
    () => allIssues.filter((i) => i.cycle_id === cycleId),
    [allIssues, cycleId],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-6 py-3">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Cycle not found.</p>
        <AppLink href={p.teamCycles(teamIdentifier)} className="text-primary hover:underline">
          <ChevronLeft className="inline size-3.5 mr-0.5" />Back to cycles
        </AppLink>
      </div>
    );
  }

  const badge = STATUS_BADGE[cycle.status as CycleStatus];

  return (
    <div className="flex flex-1 min-h-0">
      {/* Issues list */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 border-b px-6 py-3">
          <AppLink href={p.teamCycles(teamIdentifier)} className="text-muted-foreground hover:text-foreground transition-colors">
            <Timer className="size-4" />
          </AppLink>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-sm font-medium truncate">{cycle.name}</h1>
          {badge && (
            <span className={cn("text-xs px-2 py-0.5 rounded-full shrink-0", badge.className)}>
              {badge.label}
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {cycleIssues.length} issues
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {cycleIssues.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2">
              <Timer className="size-8 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">No issues in this cycle</p>
            </div>
          ) : (
            <div className="divide-y">
              {cycleIssues.map((issue) => (
                <AppLink
                  key={issue.id}
                  href={p.teamIssueDetail(teamIdentifier, issue.id)}
                  className="flex items-center gap-3 px-6 py-2.5 hover:bg-accent/60 transition-colors"
                >
                  <StatusIcon status={issue.status} className="size-4 shrink-0" />
                  <PriorityIcon priority={issue.priority} className="size-3.5 shrink-0" />
                  <span className="text-xs text-muted-foreground shrink-0">{issue.identifier}</span>
                  <span className="text-sm truncate">{issue.title}</span>
                  {issue.estimate != null && (
                    <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0">
                      {issue.estimate}pt
                    </span>
                  )}
                </AppLink>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar */}
      <div className="w-72 shrink-0 border-l overflow-y-auto hidden lg:block">
        <CycleSidebar cycle={cycle as CycleWithProgress} />
      </div>
    </div>
  );
}
