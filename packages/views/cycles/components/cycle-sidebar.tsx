"use client";

import { Play, CheckCircle2, MoreHorizontal, Trash2, Pencil } from "lucide-react";
import type { CycleWithProgress } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@multica/ui/components/ui/popover";
import { useStartCycle, useCompleteCycle, useDeleteCycle } from "@multica/core/cycles/mutations";
import { CycleBurndownChart } from "./cycle-burndown-chart";
import { CycleBreakdownTabs } from "./cycle-breakdown-tabs";

function formatDateRange(startsAt: string, endsAt: string) {
  const s = new Date(startsAt);
  const e = new Date(endsAt);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${fmt(s)} - ${fmt(e)}`;
}

function ProgressRing({ percent }: { percent: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const offset = c - (percent / 100) * c;
  return (
    <svg className="size-12 -rotate-90" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={r} fill="none" stroke="hsl(var(--muted))" strokeWidth="4" />
      <circle cx="22" cy="22" r={r} fill="none" stroke="hsl(var(--chart-1))" strokeWidth="4" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round" className="transition-all" />
      <text x="22" y="22" textAnchor="middle" dominantBaseline="central" className="fill-foreground text-[10px] font-medium rotate-90 origin-center">
        {percent}%
      </text>
    </svg>
  );
}

export function CycleSidebar({ cycle }: { cycle: CycleWithProgress }) {
  const startCycle = useStartCycle();
  const completeCycle = useCompleteCycle();
  const deleteCycle = useDeleteCycle();

  const isPlanned = cycle.status === "planned";
  const isActive = cycle.status === "active";

  return (
    <div className="space-y-6 p-4">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-semibold truncate">{cycle.name}</h2>
          <Popover>
            <PopoverTrigger className="rounded p-1 hover:bg-accent transition-colors">
              <MoreHorizontal className="size-4" />
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors">
                <Pencil className="size-4" /> Edit
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-accent transition-colors"
                onClick={() => deleteCycle.mutate(cycle.id)}
              >
                <Trash2 className="size-4" /> Delete
              </button>
            </PopoverContent>
          </Popover>
        </div>
        <p className="text-xs text-muted-foreground">{formatDateRange(cycle.starts_at, cycle.ends_at)}</p>
      </div>

      {/* Actions */}
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

      {/* Progress */}
      <div className="flex items-center gap-4">
        <ProgressRing percent={cycle.success} />
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-chart-1" />
            <span className="text-muted-foreground">Completed</span>
            <span className="font-medium">{cycle.completed.count}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-chart-3" />
            <span className="text-muted-foreground">Started</span>
            <span className="font-medium">{cycle.started.count}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-muted-foreground" />
            <span className="text-muted-foreground">Scope</span>
            <span className="font-medium">{cycle.scope.count}</span>
          </div>
        </div>
      </div>

      {/* Burndown */}
      {cycle.scope_history.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2">Burndown</p>
          <div className="rounded-lg border p-3">
            <CycleBurndownChart
              scopeHistory={cycle.scope_history}
              completedScopeHistory={cycle.completed_scope_history}
              startedScopeHistory={cycle.started_scope_history}
              startsAt={cycle.starts_at}
              endsAt={cycle.ends_at}
            />
          </div>
        </div>
      )}

      {/* Breakdowns */}
      <div>
        <p className="text-xs font-medium mb-2">Breakdown</p>
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
