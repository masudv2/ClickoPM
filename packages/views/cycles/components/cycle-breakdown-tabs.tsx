"use client";

import { useState } from "react";
import { cn } from "@multica/ui/lib/utils";
import type { BreakdownItem, LabelBreakdownItem } from "@multica/core/types";
import { LABEL_COLOR_CONFIG } from "@multica/core/labels";

type Tab = "assignees" | "labels" | "priority" | "projects";

const TABS: { value: Tab; label: string }[] = [
  { value: "assignees", label: "Assignees" },
  { value: "labels", label: "Labels" },
  { value: "priority", label: "Priority" },
  { value: "projects", label: "Projects" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-blue-400",
  none: "bg-muted-foreground/40",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

function capacityColor(pct: number) {
  if (pct > 100) return "text-red-400";
  if (pct >= 80) return "text-amber-400";
  return "text-emerald-400";
}

function capacityBarBg(pct: number) {
  if (pct > 100) return "bg-red-400";
  if (pct >= 80) return "bg-amber-400";
  return "bg-emerald-400";
}

function AssigneeRow({ item }: { item: BreakdownItem }) {
  const pct = item.total_count > 0 ? Math.round((item.completed_count / item.total_count) * 100) : 0;
  const vel = item.velocity ?? 0;
  const capPct = item.capacity_percent ?? 0;

  return (
    <div className="py-2 space-y-1">
      <div className="flex items-center gap-2.5">
        <span className="text-xs truncate min-w-0 flex-1">{item.name || "Unassigned"}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {item.completed_count}/{item.total_count}
        </span>
        <span className="text-[11px] font-medium tabular-nums shrink-0 w-8 text-right">
          {pct}%
        </span>
      </div>
      {vel > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-14">
            {item.total_points}/{vel} pts
          </span>
          <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", capacityBarBg(capPct))}
              style={{ width: `${Math.min(capPct, 100)}%` }}
            />
          </div>
          <span className={cn("text-[10px] font-medium tabular-nums shrink-0 w-8 text-right", capacityColor(capPct))}>
            {capPct}%
          </span>
        </div>
      )}
    </div>
  );
}

function BreakdownRow({
  name,
  completed,
  total,
  dotColorClass,
}: {
  name: string;
  completed: number;
  total: number;
  dotColorClass?: string;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {dotColorClass && <span className={cn("size-2 rounded-full shrink-0", dotColorClass)} />}
      <span className="text-xs truncate min-w-0 flex-1">{name || "Unassigned"}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
        {completed}/{total}
      </span>
      <span className="text-[11px] font-medium tabular-nums shrink-0 w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

function LabelRow({ item }: { item: LabelBreakdownItem }) {
  const cfg = LABEL_COLOR_CONFIG[item.color as keyof typeof LABEL_COLOR_CONFIG];
  return (
    <BreakdownRow
      name={item.name}
      completed={item.completed_count}
      total={item.total_count}
      dotColorClass={cfg?.dot ?? "bg-muted-foreground"}
    />
  );
}

export function CycleBreakdownTabs({
  assigneeBreakdown,
  labelBreakdown,
  priorityBreakdown,
  projectBreakdown,
}: {
  assigneeBreakdown: BreakdownItem[];
  labelBreakdown: LabelBreakdownItem[];
  priorityBreakdown: BreakdownItem[];
  projectBreakdown: BreakdownItem[];
}) {
  const [tab, setTab] = useState<Tab>("assignees");

  return (
    <div>
      <div className="flex gap-0.5 mb-3 p-0.5 rounded-md bg-muted/50">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "flex-1 text-[11px] px-1.5 py-1 rounded transition-all font-medium",
              tab === t.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-0">
        {tab === "assignees" &&
          (assigneeBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">No assignees</p>
          ) : (
            assigneeBreakdown.map((a) => (
              <AssigneeRow key={a.id || "unassigned"} item={a} />
            ))
          ))}
        {tab === "labels" &&
          (labelBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">No labels</p>
          ) : (
            labelBreakdown.map((l) => <LabelRow key={l.label_id} item={l} />)
          ))}
        {tab === "priority" &&
          (priorityBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">No issues</p>
          ) : (
            priorityBreakdown.map((p) => (
              <BreakdownRow
                key={p.priority || "none"}
                name={PRIORITY_LABELS[p.priority || "none"] || p.priority || ""}
                completed={Number(p.completed_count)}
                total={Number(p.total_count)}
                dotColorClass={PRIORITY_COLORS[p.priority || "none"] || "bg-muted-foreground/40"}
              />
            ))
          ))}
        {tab === "projects" &&
          (projectBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">No projects</p>
          ) : (
            projectBreakdown.map((p) => (
              <BreakdownRow
                key={p.id || "none"}
                name={p.name || "No project"}
                completed={Number(p.completed_count)}
                total={Number(p.total_count)}
              />
            ))
          ))}
      </div>
    </div>
  );
}
