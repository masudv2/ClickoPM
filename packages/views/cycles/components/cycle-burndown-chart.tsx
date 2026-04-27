"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@multica/ui/components/ui/chart";
import type { HistoryEntry } from "@multica/core/types";

interface CycleBurndownChartProps {
  scopeHistory: HistoryEntry[];
  completedScopeHistory: HistoryEntry[];
  startedScopeHistory: HistoryEntry[];
  startsAt: string;
  endsAt: string;
  mode?: "count" | "points";
}

const chartConfig = {
  scope: { label: "Scope", color: "hsl(var(--muted-foreground))" },
  completed: { label: "Completed", color: "hsl(var(--chart-1))" },
  started: { label: "Started", color: "hsl(var(--chart-3))" },
} satisfies ChartConfig;

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CycleBurndownChart({
  scopeHistory,
  completedScopeHistory,
  mode = "count",
}: CycleBurndownChartProps) {
  const field = mode === "points" ? "points" : "count";

  const data = scopeHistory.map((s, i) => ({
    date: s.date,
    scope: s[field],
    completed: completedScopeHistory[i]?.[field] ?? 0,
  }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
        No data yet
      </div>
    );
  }

  const maxScope = Math.max(...data.map((d) => d.scope), 1);

  return (
    <ChartContainer config={chartConfig} className="h-40 w-full">
      <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, maxScope]}
          tick={{ fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={30}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Area
          type="monotone"
          dataKey="scope"
          stroke="hsl(var(--muted-foreground))"
          fill="none"
          strokeDasharray="4 4"
          strokeWidth={1.5}
        />
        <Area
          type="monotone"
          dataKey="completed"
          stroke="hsl(var(--chart-1))"
          fill="hsl(var(--chart-1))"
          fillOpacity={0.2}
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
