"use client";

import type { TeamHealth, DashboardBlocker } from "@multica/core/types";
import { Card, CardContent } from "@multica/ui/components/ui/card";
import { cn } from "@multica/ui/lib/utils";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { BlockerPopover } from "./blocker-popover";
import { TEAM_BORDER_COLOR_MAP, TEAM_CHART_COLORS } from "./team-colors";

interface TeamHealthCardProps {
  team: TeamHealth;
  blockers: DashboardBlocker[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TeamHealthCard({ team, blockers }: TeamHealthCardProps) {
  const borderClass = TEAM_BORDER_COLOR_MAP[team.team_color] ?? "border-l-blue-500";
  const teamHex = TEAM_CHART_COLORS[team.team_color] ?? "#3b82f6";
  const cycle = team.active_cycle;

  const completed = cycle?.completed_count ?? 0;
  const scope = cycle?.scope_count ?? 0;
  const remaining = scope - completed;
  const progress = scope > 0 ? Math.round((completed / scope) * 100) : 0;

  const burndownData = cycle?.scope_history?.map((entry, i) => {
    const scope = entry.count ?? 0;
    const comp = cycle.completed_scope_history?.[i]?.count ?? 0;
    return { date: entry.date, remaining: scope - comp };
  }) ?? [];

  return (
    <Card className={`border-l-4 ${borderClass} overflow-hidden`}>
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <p className="font-medium text-sm text-foreground">{team.team_name}</p>
            {cycle ? (
              <p className="text-xs text-muted-foreground">
                {cycle.name} &middot;{" "}
                {new Date(cycle.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" - "}
                {new Date(cycle.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">No active cycle</p>
            )}
          </div>
          <BlockerPopover teamId={team.team_id} blockerCount={team.blocker_count} blockers={blockers} />
        </div>

        {cycle && (
          <>
            {/* Stats row */}
            <div className="grid grid-cols-4 gap-px mx-4 mb-3 rounded-md border bg-border overflow-hidden">
              <div className="bg-card px-3 py-2 text-center">
                <p className="text-base font-semibold tabular-nums">{scope}</p>
                <p className="text-[10px] text-muted-foreground">scope</p>
              </div>
              <div className="bg-card px-3 py-2 text-center">
                <p className="text-base font-semibold tabular-nums">{completed}</p>
                <p className="text-[10px] text-muted-foreground">done</p>
              </div>
              <div className="bg-card px-3 py-2 text-center">
                <p className="text-base font-semibold tabular-nums">{remaining}</p>
                <p className="text-[10px] text-muted-foreground">remaining</p>
              </div>
              <div className="bg-card px-3 py-2 text-center">
                <p className="text-base font-semibold tabular-nums">{team.velocity}</p>
                <p className="text-[10px] text-muted-foreground">velocity</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="mx-4 mb-3 space-y-1">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{progress}% complete</span>
                <span className="tabular-nums">{completed}/{scope}</span>
              </div>
              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="rounded-full transition-all"
                  style={{ width: `${progress}%`, backgroundColor: teamHex }}
                />
              </div>
            </div>

            {/* Capacity */}
            {team.velocity > 0 && (
              <div className="mx-4 mb-2">
                <span className={cn("text-[10px] font-medium tabular-nums",
                  (scope / team.velocity) * 100 > 120 ? "text-red-400"
                    : (scope / team.velocity) * 100 > 100 ? "text-amber-400"
                    : "text-emerald-400"
                )}>
                  {Math.round((scope / team.velocity) * 100)}% of capacity
                </span>
              </div>
            )}

            {/* Burndown chart */}
            {burndownData.length > 0 && (
              <div className="px-2 pb-1 h-28 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={burndownData} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
                    <defs>
                      <linearGradient id={`grad-${team.team_id}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={teamHex} stopOpacity={0.4} />
                        <stop offset="100%" stopColor={teamHex} stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="var(--border)"
                      strokeOpacity={0.3}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis hide domain={[0, (max: number) => Math.ceil(max * 1.1)]} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                            <p className="text-muted-foreground mb-0.5">{formatDate(label as string)}</p>
                            <p className="font-medium text-foreground tabular-nums">{payload[0]?.value} remaining</p>
                          </div>
                        );
                      }}
                      cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "4 4" }}
                    />
                    <Area
                      type="monotone"
                      dataKey="remaining"
                      stroke={teamHex}
                      fill={`url(#grad-${team.team_id})`}
                      fillOpacity={1}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 2.5, fill: teamHex, stroke: "hsl(var(--background))", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
