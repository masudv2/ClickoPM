"use client";

import type { VelocityDataPoint } from "@multica/core/types";
import { Card, CardContent, CardHeader, CardTitle } from "@multica/ui/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
} from "recharts";

interface VelocityChartProps {
  velocity: VelocityDataPoint[];
}

function formatShortDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
      <p className="font-medium text-foreground mb-1">{label}</p>
      {payload
        .filter((p) => p.value !== 0)
        .map((p) => (
          <div key={p.name} className="flex items-center gap-2 py-0.5">
            <span className="size-2 rounded-sm shrink-0" style={{ backgroundColor: p.color }} />
            <span className="text-muted-foreground">{p.name}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">{Math.abs(p.value)}</span>
          </div>
        ))}
    </div>
  );
}

function MultiLineTick({ x, y, payload }: { x: number; y: number; payload: { value: string } }) {
  const parts = (payload.value ?? "").split("\n");
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fontSize={10} fill="var(--muted-foreground)">
        {parts[0]}
      </text>
      {parts[1] && (
        <text x={0} y={0} dy={24} textAnchor="middle" fontSize={9} fill="var(--muted-foreground)" opacity={0.6}>
          {parts[1]}
        </text>
      )}
    </g>
  );
}

export function VelocityChart({ velocity }: VelocityChartProps) {
  const hasData = velocity.length > 0;
  if (!hasData) {
    return (
      <Card>
        <CardContent className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground">Complete your first cycle to see performance</p>
        </CardContent>
      </Card>
    );
  }

  const sorted = [...velocity].sort((a, b) => a.cycle_number - b.cycle_number);

  const scopeData = sorted.map((v) => ({
    name: `${v.cycle_name}\n${formatShortDate(v.starts_at)}-${formatShortDate(v.ends_at)}`,
    planned: v.committed,
    unplanned: v.unplanned,
    removed: v.removed > 0 ? -v.removed : 0,
  }));

  const velocityData = sorted.map((v) => ({
    name: `${v.cycle_name}\n${formatShortDate(v.starts_at)}-${formatShortDate(v.ends_at)}`,
    scope: v.committed,
    completed: v.count,
  }));

  const avgCompleted =
    sorted.length > 0
      ? Math.round(sorted.reduce((sum, v) => sum + v.count, 0) / sorted.length)
      : 0;

  const maxScope = Math.max(...scopeData.map((d) => d.planned + d.unplanned), 1);
  const maxVelocity = Math.max(...velocityData.map((d) => Math.max(d.scope, d.completed)), 1);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Scope Changes Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Scope changes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground mb-2">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-sm bg-emerald-500" />
              Planned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-sm bg-amber-400" />
              Unplanned
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-sm bg-red-400" />
              Removed
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scopeData} margin={{ top: 4, right: 4, bottom: 16, left: -8 }} stackOffset="sign">
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="name"
                  tick={MultiLineTick as never}
                  tickLine={false}
                  axisLine={false}
                  height={40}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  allowDecimals={false}
                  domain={[(min: number) => Math.min(min, 0), Math.ceil(maxScope * 1.1)]}
                />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.4} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.05 }} />
                <Bar dataKey="planned" name="Planned" stackId="scope" fill="hsl(152 60% 45%)" radius={[0, 0, 0, 0]} />
                <Bar dataKey="unplanned" name="Unplanned" stackId="scope" fill="hsl(38 92% 50%)" radius={[2, 2, 0, 0]} />
                <Bar dataKey="removed" name="Removed" stackId="scope" fill="hsl(0 72% 60%)" radius={[0, 0, 2, 2]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Velocity Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Velocity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground mb-2">
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-emerald-700" />
              Scope
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block size-2 rounded-full bg-emerald-400" />
              Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 border-t-2 border-dashed border-muted-foreground" />
              Average
            </span>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={velocityData} margin={{ top: 4, right: 4, bottom: 16, left: -8 }} barGap={2}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--border)"
                  strokeOpacity={0.5}
                />
                <XAxis
                  dataKey="name"
                  tick={MultiLineTick as never}
                  tickLine={false}
                  axisLine={false}
                  height={40}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                  allowDecimals={false}
                  domain={[0, Math.ceil(maxVelocity * 1.15)]}
                />
                <ReferenceLine
                  y={avgCompleted}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="6 4"
                  strokeWidth={1.5}
                  strokeOpacity={0.6}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "var(--muted-foreground)", fillOpacity: 0.05 }} />
                <Bar dataKey="scope" name="Scope" fill="hsl(152 50% 28%)" radius={[2, 2, 0, 0]} barSize={20} />
                <Bar dataKey="completed" name="Completed" fill="hsl(152 60% 45%)" radius={[2, 2, 0, 0]} barSize={20} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
