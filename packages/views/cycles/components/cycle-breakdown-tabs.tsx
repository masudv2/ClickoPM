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

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 flex-1 rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${Math.min(percent, 100)}%` }}
      />
    </div>
  );
}

function BreakdownRow({ name, percent, completed, total }: { name: string; percent: number; completed: number; total: number }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs truncate w-24 shrink-0">{name || "Unassigned"}</span>
      <ProgressBar percent={percent} />
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {completed}/{total}
      </span>
    </div>
  );
}

function LabelRow({ item }: { item: LabelBreakdownItem }) {
  const cfg = LABEL_COLOR_CONFIG[item.color as keyof typeof LABEL_COLOR_CONFIG];
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={cn("size-2 rounded-full shrink-0", cfg?.dot ?? "bg-muted-foreground")} />
      <span className="text-xs truncate w-20 shrink-0">{item.name}</span>
      <ProgressBar percent={item.percent} />
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {item.completed_count}/{item.total_count}
      </span>
    </div>
  );
}

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

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
      <div className="flex gap-1 mb-3">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "text-xs px-2 py-1 rounded-md transition-colors",
              tab === t.value
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-0.5">
        {tab === "assignees" &&
          (assigneeBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No assignees</p>
          ) : (
            assigneeBreakdown.map((a) => (
              <BreakdownRow key={a.id || "unassigned"} name={a.name || ""} percent={a.percent} completed={Number(a.completed_count)} total={Number(a.total_count)} />
            ))
          ))}
        {tab === "labels" &&
          (labelBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No labels</p>
          ) : (
            labelBreakdown.map((l) => <LabelRow key={l.label_id} item={l} />)
          ))}
        {tab === "priority" &&
          (priorityBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No issues</p>
          ) : (
            priorityBreakdown.map((p) => (
              <BreakdownRow key={p.priority || "none"} name={PRIORITY_LABELS[p.priority || "none"] || p.priority || ""} percent={p.percent} completed={Number(p.completed_count)} total={Number(p.total_count)} />
            ))
          ))}
        {tab === "projects" &&
          (projectBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No projects</p>
          ) : (
            projectBreakdown.map((p) => (
              <BreakdownRow key={p.id || "none"} name={p.name || "No project"} percent={p.percent} completed={Number(p.completed_count)} total={Number(p.total_count)} />
            ))
          ))}
      </div>
    </div>
  );
}
