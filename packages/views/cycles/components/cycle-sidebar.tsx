"use client";

import { Play, CheckCircle2, MoreHorizontal, Trash2, Pencil, RefreshCw, ArrowRight } from "lucide-react";
import type { CycleWithProgress } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@multica/ui/components/ui/popover";
import { useStartCycle, useCompleteCycle, useDeleteCycle } from "@multica/core/cycles/mutations";
import { cn } from "@multica/ui/lib/utils";
import { CycleBurndownChart } from "./cycle-burndown-chart";
import { CycleBreakdownTabs } from "./cycle-breakdown-tabs";

const STATUS_LABEL: Record<string, { label: string; className: string; dotClass: string }> = {
  active: { label: "Current", className: "text-blue-400", dotClass: "bg-blue-400" },
  planned: { label: "Upcoming", className: "text-muted-foreground", dotClass: "bg-muted-foreground" },
  cooldown: { label: "Cooldown", className: "text-orange-400", dotClass: "bg-orange-400" },
  completed: { label: "Completed", className: "text-green-400", dotClass: "bg-green-400" },
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ProgressBar({ scope, started, completed }: { scope: number; started: number; completed: number }) {
  const total = scope || 1;
  const completedPct = (completed / total) * 100;
  const startedPct = (started / total) * 100;

  return (
    <div className="relative h-2 w-full rounded-full bg-muted/60 overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-amber-400/60 transition-all duration-300"
        style={{ width: `${Math.min(startedPct + completedPct, 100)}%` }}
      />
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-blue-500 transition-all duration-300"
        style={{ width: `${Math.min(completedPct, 100)}%` }}
      />
    </div>
  );
}

function capacityColor(pct: number) {
  if (pct > 120) return "text-red-400";
  if (pct > 100) return "text-amber-400";
  return "text-emerald-400";
}

export function CycleSidebar({ cycle }: { cycle: CycleWithProgress }) {
  const startCycle = useStartCycle();
  const completeCycle = useCompleteCycle();
  const deleteCycle = useDeleteCycle();

  const isPlanned = cycle.status === "planned";
  const isActive = cycle.status === "active";
  const statusInfo = (STATUS_LABEL[cycle.status] ?? STATUS_LABEL.planned) as { label: string; className: string; dotClass: string };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50">
        <div className="flex items-center gap-2 text-xs mb-2">
          <span className={cn("flex items-center gap-1.5 font-medium", statusInfo.className)}>
            <span className={cn("size-1.5 rounded-full", statusInfo.dotClass)} />
            {statusInfo.label}
          </span>
          <span className="text-muted-foreground/70">
            {formatDate(cycle.starts_at)} <ArrowRight className="inline size-3" /> {formatDate(cycle.ends_at)}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="size-4 text-blue-400" />
            <h2 className="text-sm font-semibold truncate">{cycle.name}</h2>
          </div>
          <Popover>
            <PopoverTrigger className="rounded p-1 hover:bg-accent transition-colors">
              <MoreHorizontal className="size-4 text-muted-foreground" />
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors">
                <Pencil className="size-3.5" /> Edit
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-accent transition-colors"
                onClick={() => deleteCycle.mutate(cycle.id)}
              >
                <Trash2 className="size-3.5" /> Delete
              </button>
            </PopoverContent>
          </Popover>
        </div>

        {/* Capacity badge */}
        {cycle.velocity > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <span className={cn("text-[11px] font-medium tabular-nums", capacityColor(cycle.capacity_percent))}>
              {Math.round(cycle.capacity_percent)}% of capacity
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {cycle.scope.count} scope
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      {(isPlanned || isActive) && (
        <div className="px-4 py-3 border-b border-border/50">
          {isPlanned && (
            <Button size="sm" className="w-full" onClick={() => startCycle.mutate(cycle.id)}>
              <Play className="size-3.5 mr-1.5" /> Start cycle
            </Button>
          )}
          {isActive && (
            <Button size="sm" variant="outline" className="w-full" onClick={() => completeCycle.mutate(cycle.id)}>
              <CheckCircle2 className="size-3.5 mr-1.5" /> Complete cycle
            </Button>
          )}
        </div>
      )}

      {/* Progress overview */}
      <div className="px-4 py-3 border-b border-border/50 space-y-3">
        <p className="text-xs font-medium text-muted-foreground">Progress</p>
        <ProgressBar
          scope={cycle.scope.count}
          started={cycle.started.count}
          completed={cycle.completed.count}
        />
        <div className="grid grid-cols-4 gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-muted-foreground/40" />
              <span className="text-[10px] text-muted-foreground">Scope</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tabular-nums leading-tight">{cycle.scope.count}</span>
              {cycle.scope_creep > 0 && (
                <span className="text-[10px] text-red-400 font-medium tabular-nums">+{Math.round(cycle.scope_creep)}%</span>
              )}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-amber-400" />
              <span className="text-[10px] text-muted-foreground">Started</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tabular-nums leading-tight">{cycle.started.count}</span>
              <span className="text-[10px] text-amber-400 font-medium tabular-nums">{cycle.started.percent}%</span>
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-blue-500" />
              <span className="text-[10px] text-muted-foreground">Completed</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold tabular-nums leading-tight">{cycle.completed.count}</span>
              <span className="text-[10px] text-blue-400 font-medium tabular-nums">{cycle.completed.percent}%</span>
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-emerald-400" />
              <span className="text-[10px] text-muted-foreground">Velocity</span>
            </div>
            <span className="text-lg font-bold tabular-nums leading-tight">{cycle.velocity || "—"}</span>
          </div>
        </div>
      </div>

      {/* Burndown chart */}
      <div className="px-4 py-3 border-b border-border/50">
        <CycleBurndownChart
          scopeHistory={cycle.scope_history}
          completedScopeHistory={cycle.completed_scope_history}
          startedScopeHistory={cycle.started_scope_history}
          startsAt={cycle.starts_at}
          endsAt={cycle.ends_at}
          live={{
            scope: cycle.scope.count,
            started: cycle.started.count,
            completed: cycle.completed.count,
          }}
        />
      </div>

      {/* Breakdown tabs */}
      <div className="px-4 py-3 flex-1 overflow-y-auto">
        <CycleBreakdownTabs
          assigneeBreakdown={cycle.assignee_breakdown}
          labelBreakdown={cycle.label_breakdown}
          priorityBreakdown={cycle.priority_breakdown}
          projectBreakdown={cycle.project_breakdown}
        />
      </div>
    </div>
  );
}
