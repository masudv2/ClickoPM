"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import type { HistoryEntry } from "@multica/core/types";

interface LiveStats {
  scope: number;
  started: number;
  completed: number;
}

interface CycleBurndownChartProps {
  scopeHistory: HistoryEntry[];
  completedScopeHistory: HistoryEntry[];
  startedScopeHistory: HistoryEntry[];
  startsAt: string;
  endsAt: string;
  mode?: "count" | "points";
  live?: LiveStats;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CycleBurndownChart({
  scopeHistory,
  completedScopeHistory,
  startedScopeHistory,
  mode = "count",
  live,
}: CycleBurndownChartProps) {
  const field = mode === "points" ? "points" : "count";

  const raw = (scopeHistory ?? []).map((s, i) => {
    const startedVal = (startedScopeHistory ?? [])[i]?.[field] ?? 0;
    const completedVal = (completedScopeHistory ?? [])[i]?.[field] ?? 0;
    return {
      date: s.date,
      scope: s[field],
      started: startedVal + completedVal,
      completed: completedVal,
      _startedRaw: startedVal,
      _completedRaw: completedVal,
    };
  });

  // Replace or append today's entry with live data so the chart is always current
  if (live) {
    const today = new Date().toISOString().slice(0, 10);
    const liveEntry = {
      date: today,
      scope: live.scope,
      started: live.started + live.completed,
      completed: live.completed,
      _startedRaw: live.started,
      _completedRaw: live.completed,
    };
    const todayIdx = raw.findIndex((r) => r.date === today);
    if (todayIdx >= 0) {
      raw[todayIdx] = liveEntry;
    } else if (raw.length > 0) {
      raw.push(liveEntry);
    }
  }

  if (raw.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No data yet
      </div>
    );
  }

  const startScope = raw[0]?.scope ?? 0;
  const totalSteps = raw.length > 1 ? raw.length - 1 : 1;

  const data = raw.map((d, i) => ({
    ...d,
    ideal: Math.max(0, startScope - (startScope / totalSteps) * i),
  }));

  const maxScope = Math.max(...data.map((d) => d.scope), 1);

  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -4 }}>
          <defs>
            <linearGradient id="burnScope" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(215 20% 65%)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="hsl(215 20% 65%)" stopOpacity={0.01} />
            </linearGradient>
            <linearGradient id="burnStarted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(38 92% 50%)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="hsl(38 92% 50%)" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="burnCompleted" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(235 70% 60%)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="hsl(235 70% 60%)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 3"
            vertical={false}
            stroke="var(--border)"
            strokeOpacity={0.4}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatDate}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, Math.ceil(maxScope * 1.1)]}
            tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
            axisLine={false}
            tickLine={false}
            width={28}
            allowDecimals={false}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const entry = payload[0]?.payload as Record<string, number> | undefined;
              const rows = [
                { name: "Scope", color: "hsl(215 20% 65%)", value: entry?.scope },
                { name: "Started", color: "hsl(38 92% 50%)", value: entry?._startedRaw },
                { name: "Completed", color: "hsl(235 70% 60%)", value: entry?._completedRaw },
              ];
              return (
                <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
                  <p className="font-medium text-foreground mb-1">{formatDate(label as string)}</p>
                  {rows.map((r) => (
                    <div key={r.name} className="flex items-center gap-2 py-0.5">
                      <span className="size-2 rounded-sm shrink-0" style={{ backgroundColor: r.color }} />
                      <span className="text-muted-foreground">{r.name}</span>
                      <span className="ml-auto font-medium tabular-nums text-foreground">{r.value ?? 0}</span>
                    </div>
                  ))}
                </div>
              );
            }}
            cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "4 4" }}
          />
          {/* Scope area */}
          <Area
            type="monotone"
            dataKey="scope"
            name="Scope"
            stroke="hsl(215 20% 65%)"
            fill="url(#burnScope)"
            strokeWidth={1.5}
            dot={false}
            activeDot={false}
          />
          {/* Ideal burndown line */}
          <Area
            type="linear"
            dataKey="ideal"
            name="Target"
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            strokeWidth={1}
            strokeOpacity={0.4}
            fill="none"
            dot={false}
            activeDot={false}
          />
          {/* Started area */}
          <Area
            type="monotone"
            dataKey="started"
            name="Started"
            stroke="hsl(38 92% 50%)"
            fill="url(#burnStarted)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: "hsl(38 92% 50%)", stroke: "hsl(var(--background))", strokeWidth: 2 }}
          />
          {/* Completed area */}
          <Area
            type="monotone"
            dataKey="completed"
            name="Completed"
            stroke="hsl(235 70% 60%)"
            fill="url(#burnCompleted)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3, fill: "hsl(235 70% 60%)", stroke: "hsl(var(--background))", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
