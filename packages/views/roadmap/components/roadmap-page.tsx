"use client";

import { useState, useMemo, useRef, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GanttChart, ChevronLeft, ArrowRight, ZoomIn, ZoomOut } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import { Button } from "@multica/ui/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { teamListOptions } from "@multica/core/teams";
import { roadmapProjectsOptions, projectKeys } from "@multica/core/projects/queries";
import { projectMilestonesOptions } from "@multica/core/milestones";
import { memberListOptions } from "@multica/core/workspace/queries";
import { api } from "@multica/core/api";
import type { RoadmapProject, Team, ProjectHealthStatus, Issue, Milestone } from "@multica/core/types";
import { Diamond } from "lucide-react";
import { ActorAvatar } from "@multica/ui/components/common/actor-avatar";

type ZoomLevel = "day" | "week" | "month" | "quarter";

const ZOOM_LEVELS: { value: ZoomLevel; label: string; pxPerDay: number }[] = [
  { value: "day", label: "Day", pxPerDay: 40 },
  { value: "week", label: "Week", pxPerDay: 16 },
  { value: "month", label: "Month", pxPerDay: 5 },
  { value: "quarter", label: "Quarter", pxPerDay: 1.8 },
];

const ROW_HEIGHT = 36;
const DETAIL_ROW_HEIGHT = 32;
const TEAM_HEADER_HEIGHT = 33;

const HEALTH_CONFIG: Record<ProjectHealthStatus, { label: string; className: string; dot: string; barColor: string }> = {
  on_track: { label: "On Track", className: "bg-green-500/15 text-green-400 border-green-500/30", dot: "bg-green-500", barColor: "rgb(34 197 94 / 0.5)" },
  at_risk: { label: "At Risk", className: "bg-amber-500/15 text-amber-400 border-amber-500/30", dot: "bg-amber-500", barColor: "rgb(245 158 11 / 0.5)" },
  behind: { label: "Behind", className: "bg-red-500/15 text-red-400 border-red-500/30", dot: "bg-red-500", barColor: "rgb(239 68 68 / 0.5)" },
};

const STATUS_COLORS: Record<string, { bg: string; border: string }> = {
  done: { bg: "bg-green-500/30", border: "border-green-500/40" },
  cancelled: { bg: "bg-green-500/30", border: "border-green-500/40" },
  in_progress: { bg: "bg-blue-500/30", border: "border-blue-500/40" },
  in_review: { bg: "bg-blue-500/30", border: "border-blue-500/40" },
  blocked: { bg: "bg-red-500/30", border: "border-red-500/40" },
};

function getTimelineRange(projects: RoadmapProject[]): { start: Date; end: Date } {
  const now = new Date();
  let minDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  let maxDate = new Date(now.getFullYear() + 5, now.getMonth(), 0);

  for (const p of projects) {
    if (p.start_date) {
      const d = new Date(p.start_date);
      if (d < minDate) minDate = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    }
    if (p.target_date) {
      const d = new Date(p.target_date);
      if (d > maxDate) maxDate = new Date(d.getFullYear(), d.getMonth() + 2, 0);
    }
  }

  minDate = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  maxDate = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0);
  return { start: minDate, end: maxDate };
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function formatDateForApi(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function generateTimelineColumns(start: Date, end: Date, zoom: ZoomLevel): { date: Date; label: string; isHighlight: boolean }[] {
  const cols: { date: Date; label: string; isHighlight: boolean }[] = [];
  const now = new Date();
  const current = new Date(start);

  if (zoom === "day") {
    while (current <= end) {
      const isToday = current.toDateString() === now.toDateString();
      const dayName = current.toLocaleDateString("en-US", { weekday: "short" });
      const monthLabel = current.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      cols.push({
        date: new Date(current),
        label: current.getDate() === 1 ? `${dayName} · ${monthLabel}` : `${dayName} ${current.getDate()}`,
        isHighlight: isToday,
      });
      current.setDate(current.getDate() + 1);
    }
  } else if (zoom === "week") {
    const weekStart = new Date(current);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    while (weekStart <= end) {
      const isCurrentWeek = daysBetween(now, weekStart) >= -6 && daysBetween(now, weekStart) <= 0;
      cols.push({
        date: new Date(weekStart),
        label: weekStart.getDate() <= 7
          ? weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })
          : `${weekStart.getDate()}`,
        isHighlight: isCurrentWeek,
      });
      weekStart.setDate(weekStart.getDate() + 7);
    }
  } else if (zoom === "month") {
    while (current <= end) {
      const isCurrentMonth = current.getMonth() === now.getMonth() && current.getFullYear() === now.getFullYear();
      cols.push({
        date: new Date(current),
        label: current.toLocaleDateString("en-US", { month: "short", year: "numeric" }),
        isHighlight: isCurrentMonth,
      });
      current.setMonth(current.getMonth() + 1);
    }
  } else {
    const qStart = new Date(start.getFullYear(), Math.floor(start.getMonth() / 3) * 3, 1);
    while (qStart <= end) {
      const q = Math.floor(qStart.getMonth() / 3) + 1;
      const isCurrentQ = qStart.getFullYear() === now.getFullYear() && q === Math.floor(now.getMonth() / 3) + 1;
      cols.push({
        date: new Date(qStart),
        label: `Q${q} ${qStart.getFullYear()}`,
        isHighlight: isCurrentQ,
      });
      qStart.setMonth(qStart.getMonth() + 3);
    }
  }

  return cols;
}

function getColumnWidth(col: { date: Date }, nextCol: { date: Date } | undefined, end: Date, pxPerDay: number): number {
  const next = nextCol ? nextCol.date : end;
  return daysBetween(col.date, next) * pxPerDay;
}

type DragState = {
  type: "move" | "resize-left" | "resize-right";
  id: string;
  kind: "project" | "issue" | "milestone";
  origStart: Date;
  origEnd: Date;
  startX: number;
  currentStart: Date;
  currentEnd: Date;
};

function useDragBar(
  pxPerDay: number,
  onComplete: (id: string, kind: "project" | "issue" | "milestone", newStart: Date, newEnd: Date) => void,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const didDragRef = useRef(false);
  const hasMoved = useRef(false);

  const onMouseDown = useCallback(
    (
      e: React.MouseEvent,
      id: string,
      kind: "project" | "issue" | "milestone",
      type: DragState["type"],
      start: Date,
      end: Date,
    ) => {
      e.preventDefault();
      e.stopPropagation();
      hasMoved.current = false;
      const state: DragState = {
        type,
        id,
        kind,
        origStart: start,
        origEnd: end,
        startX: e.clientX,
        currentStart: start,
        currentEnd: end,
      };
      dragRef.current = state;
      setDrag(state);
    },
    [],
  );

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) > 3) hasMoved.current = true;
      const daysDelta = Math.round(dx / pxPerDay);

      let newStart = d.origStart;
      let newEnd = d.origEnd;

      if (d.type === "move") {
        newStart = new Date(d.origStart.getTime() + daysDelta * 86400000);
        newEnd = new Date(d.origEnd.getTime() + daysDelta * 86400000);
      } else if (d.type === "resize-left") {
        newStart = new Date(d.origStart.getTime() + daysDelta * 86400000);
        if (newStart >= d.origEnd) newStart = new Date(d.origEnd.getTime() - 86400000);
      } else {
        newEnd = new Date(d.origEnd.getTime() + daysDelta * 86400000);
        if (newEnd <= d.origStart) newEnd = new Date(d.origStart.getTime() + 86400000);
      }

      const next: DragState = { ...d, currentStart: newStart, currentEnd: newEnd };
      dragRef.current = next;
      setDrag(next);
    };

    const onUp = () => {
      const d = dragRef.current;
      if (d && hasMoved.current) {
        didDragRef.current = true;
        const startChanged = d.currentStart.getTime() !== d.origStart.getTime();
        const endChanged = d.currentEnd.getTime() !== d.origEnd.getTime();
        if (startChanged || endChanged) {
          onComplete(d.id, d.kind, d.currentStart, d.currentEnd);
        }
        // Reset didDrag after a tick so click handler can check it
        setTimeout(() => { didDragRef.current = false; }, 0);
      }
      dragRef.current = null;
      setDrag(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, pxPerDay, onComplete]);

  return { drag, onMouseDown, didDragRef };
}

function ProjectBar({
  project, pxPerDay, timelineStart, onClick, drag, onDragStart,
  members, didDragRef,
}: {
  project: RoadmapProject; pxPerDay: number; timelineStart: Date;
  onClick: () => void;
  drag: DragState | null;
  onDragStart: (e: React.MouseEvent, id: string, kind: "project" | "issue" | "milestone", type: DragState["type"], start: Date, end: Date) => void;
  members: Record<string, { name: string; avatar_url: string | null }>;
  didDragRef: React.RefObject<boolean>;
}) {
  if (!project.start_date && !project.target_date) return <div style={{ height: ROW_HEIGHT }} />;

  const isDragging = drag?.id === project.id && drag.kind === "project";
  const startDate = isDragging ? drag.currentStart : new Date(project.start_date ?? project.target_date!);
  const endDate = isDragging ? drag.currentEnd : (project.target_date ? new Date(project.target_date) : new Date(startDate.getTime() + 30 * 86400000));

  const origStart = project.start_date ? new Date(project.start_date) : new Date(project.target_date!);
  const origEnd = project.target_date ? new Date(project.target_date) : new Date(origStart.getTime() + 30 * 86400000);

  const left = daysBetween(timelineStart, startDate) * pxPerDay;
  const width = Math.max(daysBetween(startDate, endDate) * pxPerDay, 30);
  const pct = project.issue_count > 0 ? (project.done_count / project.issue_count) * 100 : 0;
  const health = HEALTH_CONFIG[project.health_status];
  const lead = project.lead_id && project.lead_type === "member" ? members[project.lead_id] : null;

  return (
    <div style={{ height: ROW_HEIGHT }} className="relative flex items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              onClick={() => { if (!didDragRef.current) onClick(); }}
              className={cn(
                "absolute h-7 rounded-md cursor-pointer overflow-hidden group/bar",
                isDragging && "opacity-80 ring-2 ring-primary/50",
              )}
              style={{ left, width }}
            />
          }
        >
          {/* Resize left handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-2 cursor-col-resize z-20 opacity-0 group-hover/bar:opacity-100 bg-white/0 hover:bg-white/20 rounded-l-md"
            onMouseDown={(e) => onDragStart(e, project.id, "project", "resize-left", origStart, origEnd)}
          />
          <div className="absolute inset-0 bg-muted-foreground/20 rounded-md" />
          <div
            className={cn("absolute inset-y-0 left-0 rounded-l-md", pct >= 100 && "rounded-r-md")}
            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: health.barColor }}
          />
          <span
            className="relative z-10 px-2 text-xs font-medium text-foreground truncate block leading-7 cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => onDragStart(e, project.id, "project", "move", origStart, origEnd)}
          >
            {project.title}
          </span>
          {/* Lead avatar on the bar */}
          {lead && (
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
              <ActorAvatar name={lead.name} initials={lead.name[0]!.toUpperCase()} avatarUrl={lead.avatar_url} size={18} />
            </div>
          )}
          {/* Resize right handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize z-20 opacity-0 group-hover/bar:opacity-100 bg-white/0 hover:bg-white/20 rounded-r-md"
            onMouseDown={(e) => onDragStart(e, project.id, "project", "resize-right", origStart, origEnd)}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="p-0 overflow-hidden rounded-lg border border-border/50 bg-popover shadow-lg">
          <div className="px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">{project.title}</span>
              <span className={cn("px-1.5 py-0.5 rounded text-[10px] border", health.className)}>
                {health.label}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{project.done_count}/{project.issue_count} done ({Math.round(pct)}%)</span>
              {project.start_date && project.target_date && (
                <span>
                  {new Date(project.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  {" - "}
                  {new Date(project.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              )}
            </div>
            {lead && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ActorAvatar name={lead.name} initials={lead.name[0]!.toUpperCase()} avatarUrl={lead.avatar_url} size={14} />
                <span>Lead: {lead.name}</span>
              </div>
            )}
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: health.barColor }} />
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function MilestoneBar({
  milestone, pxPerDay, timelineStart, drag, onDragStart, didDragRef, onClick,
}: {
  milestone: Milestone;
  pxPerDay: number;
  timelineStart: Date;
  drag: DragState | null;
  onDragStart: (e: React.MouseEvent, id: string, kind: "project" | "issue" | "milestone", type: DragState["type"], start: Date, end: Date) => void;
  didDragRef: React.RefObject<boolean>;
  onClick?: () => void;
}) {
  const start = milestone.start_date ? new Date(milestone.start_date) : null;
  const end = milestone.target_date ? new Date(milestone.target_date) : null;
  if (!start && !end) return <div style={{ height: DETAIL_ROW_HEIGHT }} />;

  const isDragging = drag?.id === milestone.id && drag.kind === "milestone";
  const origStart = start ?? new Date(end!.getTime() - 14 * 86400000);
  const origEnd = end ?? new Date(origStart.getTime() + 14 * 86400000);

  const curStart = isDragging ? drag.currentStart : origStart;
  const curEnd = isDragging ? drag.currentEnd : origEnd;
  const left = daysBetween(timelineStart, curStart) * pxPerDay;
  const width = Math.max(daysBetween(curStart, curEnd) * pxPerDay, 20);

  return (
    <div style={{ height: DETAIL_ROW_HEIGHT }} className="relative flex items-center">
      <div
        onClick={() => { if (!didDragRef.current && onClick) onClick(); }}
        className={cn(
          "absolute h-6 rounded flex items-center gap-1.5 px-2 group/bar bg-primary/15 border border-primary/40 hover:bg-primary/25 transition-colors",
          isDragging && "opacity-80 ring-2 ring-primary/50",
        )}
        style={{ left: Math.max(left, 0), width: Math.max(width, 20) }}
      >
        <div
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 opacity-0 group-hover/bar:opacity-100 hover:bg-white/20 rounded-l"
          onMouseDown={(e) => onDragStart(e, milestone.id, "milestone", "resize-left", origStart, origEnd)}
        />
        <Diamond className="size-3 text-primary shrink-0 pointer-events-none" />
        <span
          className="text-[11px] truncate text-foreground/80 flex-1 cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => onDragStart(e, milestone.id, "milestone", "move", origStart, origEnd)}
        >
          {milestone.name}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums shrink-0 pointer-events-none">{milestone.percent}%</span>
        <div
          className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 opacity-0 group-hover/bar:opacity-100 hover:bg-white/20 rounded-r"
          onMouseDown={(e) => onDragStart(e, milestone.id, "milestone", "resize-right", origStart, origEnd)}
        />
      </div>
    </div>
  );
}

function IssueBar({
  issue, pxPerDay, timelineStart, members, drag, onDragStart, didDragRef, onClick,
}: {
  issue: Issue; pxPerDay: number; timelineStart: Date;
  members: Record<string, { name: string; avatar_url: string | null }>;
  drag: DragState | null;
  onDragStart: (e: React.MouseEvent, id: string, kind: "project" | "issue" | "milestone", type: DragState["type"], start: Date, end: Date) => void;
  didDragRef: React.RefObject<boolean>;
  onClick?: () => void;
}) {
  const issueStart = issue.start_date ? new Date(issue.start_date) : null;
  const issueEnd = issue.due_date ? new Date(issue.due_date) : null;
  if (!issueStart && !issueEnd) return <div style={{ height: DETAIL_ROW_HEIGHT }} />;

  const isDragging = drag?.id === issue.id && drag.kind === "issue";
  // Default: if only due_date, show a 14-day bar ending at due_date
  // If only start_date, show 14-day bar starting at start_date
  const origStart = issueStart ?? new Date(issueEnd!.getTime() - 14 * 86400000);
  const origEnd = issueEnd ?? new Date(origStart.getTime() + 14 * 86400000);

  const start = isDragging ? drag.currentStart : origStart;
  const end = isDragging ? drag.currentEnd : origEnd;

  const left = daysBetween(timelineStart, start) * pxPerDay;
  const width = Math.max(daysBetween(start, end) * pxPerDay, 20);

  const statusKey = issue.status;
  const colors = STATUS_COLORS[statusKey] ?? { bg: "bg-muted", border: "border-border" };
  const assignee = issue.assignee_id && issue.assignee_type === "member" ? members[issue.assignee_id] : null;

  return (
    <div style={{ height: DETAIL_ROW_HEIGHT }} className="relative flex items-center">
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              onClick={() => { if (!didDragRef.current && onClick) onClick(); }}
              className={cn(
                "absolute h-6 rounded flex items-center gap-1 px-1.5 group/bar border",
                colors.bg, colors.border,
                isDragging && "opacity-80 ring-2 ring-primary/50",
              )}
              style={{ left: Math.max(left, 0), width: Math.max(width, 20) }}
            />
          }
        >
          {/* Resize left handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 opacity-0 group-hover/bar:opacity-100 bg-white/0 hover:bg-white/20 rounded-l"
            onMouseDown={(e) => onDragStart(e, issue.id, "issue", "resize-left", origStart, origEnd)}
          />
          {assignee && (
            <div className="pointer-events-none shrink-0">
              <ActorAvatar name={assignee.name} initials={assignee.name[0]!.toUpperCase()} avatarUrl={assignee.avatar_url} size={14} />
            </div>
          )}
          <span
            className="text-[11px] truncate text-foreground/80 flex-1 cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => onDragStart(e, issue.id, "issue", "move", origStart, origEnd)}
          >
            {issue.title}
          </span>
          {/* Resize right handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-20 opacity-0 group-hover/bar:opacity-100 bg-white/0 hover:bg-white/20 rounded-r"
            onMouseDown={(e) => onDragStart(e, issue.id, "issue", "resize-right", origStart, origEnd)}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="p-0 overflow-hidden rounded-lg border border-border/50 bg-popover shadow-lg">
          <div className="px-3 py-2 space-y-1">
            <p className="font-semibold text-sm">{issue.title}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(
                "px-1.5 py-0.5 rounded border capitalize",
                colors.bg, colors.border,
              )}>
                {issue.status.replace("_", " ")}
              </span>
              <span className="capitalize">{issue.priority}</span>
            </div>
            {(issueStart || issueEnd) && (
              <p className="text-xs text-muted-foreground">
                {issueStart && issueStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {issueStart && issueEnd && " - "}
                {issueEnd && issueEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </p>
            )}
            {assignee && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ActorAvatar name={assignee.name} initials={assignee.name[0]!.toUpperCase()} avatarUrl={assignee.avatar_url} size={14} />
                <span>{assignee.name}</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function TodayLine({ timelineStart, pxPerDay, totalDays }: { timelineStart: Date; pxPerDay: number; totalDays: number }) {
  const now = new Date();
  const offset = daysBetween(timelineStart, now);
  if (offset < 0 || offset > totalDays) return null;
  return (
    <div
      className="absolute top-0 w-px bg-red-500 z-30 pointer-events-none"
      style={{ left: offset * pxPerDay, bottom: 0, minHeight: "100vh" }}
    >
      <div className="w-2 h-2 rounded-full bg-red-500 -translate-x-[3px] -top-1 absolute" />
    </div>
  );
}

function TimelineHeader({
  columns, timelineStart, timelineEnd, pxPerDay, zoom,
}: {
  columns: { date: Date; label: string; isHighlight: boolean }[];
  timelineStart: Date; timelineEnd: Date; pxPerDay: number; zoom: ZoomLevel;
}) {
  const totalWidth = daysBetween(timelineStart, timelineEnd) * pxPerDay;

  const showMonthRow = zoom === "day" || zoom === "week";
  const months = useMemo(() => {
    if (!showMonthRow) return [];
    const result: { date: Date; label: string; width: number; left: number }[] = [];
    const current = new Date(timelineStart.getFullYear(), timelineStart.getMonth(), 1);
    while (current <= timelineEnd) {
      const next = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      const clampedStart = current < timelineStart ? timelineStart : current;
      const clampedEnd = next > timelineEnd ? timelineEnd : next;
      result.push({
        date: new Date(current),
        label: current.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
        left: daysBetween(timelineStart, clampedStart) * pxPerDay,
        width: daysBetween(clampedStart, clampedEnd) * pxPerDay,
      });
      current.setMonth(current.getMonth() + 1);
    }
    return result;
  }, [showMonthRow, timelineStart, timelineEnd, pxPerDay]);

  return (
    <div className="sticky top-0 z-20 bg-background border-b" style={{ width: totalWidth }}>
      {showMonthRow && (
        <div className="relative h-6 border-b border-border/30">
          {months.map((m) => (
            <div
              key={m.date.toISOString()}
              className="absolute top-0 h-full flex items-center px-2 text-[10px] font-medium text-muted-foreground border-r border-border/30"
              style={{ left: m.left, width: m.width }}
            >
              {m.label}
            </div>
          ))}
        </div>
      )}
      <div className="relative h-8 flex">
        {columns.map((col, i) => {
          const next = columns[i + 1];
          const w = getColumnWidth(col, next, timelineEnd, pxPerDay);
          return (
            <div
              key={col.date.toISOString()}
              className={cn(
                "flex-none border-r border-border/30 flex items-center justify-center",
                col.isHighlight && "bg-primary/5 text-primary font-semibold",
              )}
              style={{ width: w }}
            >
              <span className="text-[11px] truncate px-1">{col.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RoadmapPage() {
  const wsId = useWorkspaceId();
  const wsPaths = useWorkspacePaths();
  const qc = useQueryClient();
  const [teamFilter, setTeamFilter] = useState<string | undefined>(undefined);
  const [selectedProject, setSelectedProject] = useState<RoadmapProject | null>(null);
  const [selectedMilestone, setSelectedMilestone] = useState<{ id: string; name: string; start_date: string | null; target_date: string | null } | null>(null);
  const [zoom, setZoom] = useState<ZoomLevel>("month");
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasScrolledToToday = useRef(false);

  const { data: teams = [] } = useQuery(teamListOptions(wsId));
  const { data: projects = [] } = useQuery(roadmapProjectsOptions(wsId, teamFilter));
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const { data: projectMilestones = [] } = useQuery({
    ...projectMilestonesOptions(wsId, selectedProject?.id ?? ""),
    enabled: !!selectedProject,
  });
  const { data: milestoneIssues = [] } = useQuery({
    queryKey: ["issues", wsId, "milestone", selectedMilestone?.id],
    queryFn: () => api.listIssues({ milestone_id: selectedMilestone!.id, limit: 200 }),
    select: (data) => data.issues,
    enabled: !!selectedMilestone,
  });

  const updateProjectMut = useMutation({
    mutationFn: ({ id, start_date, target_date }: { id: string; start_date?: string; target_date?: string }) =>
      api.updateProject(id, { start_date, target_date }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: projectKeys.roadmap(wsId) });
    },
  });

  const updateIssueMut = useMutation({
    mutationFn: ({ id, start_date, due_date }: { id: string; start_date?: string; due_date?: string }) =>
      api.updateIssue(id, { start_date, due_date }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["issues", wsId] });
    },
  });

  const updateMilestoneMut = useMutation({
    mutationFn: ({ id, start_date, target_date }: { id: string; start_date?: string; target_date?: string }) =>
      api.updateMilestone(id, { start_date, target_date }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["milestones", wsId] });
    },
  });

  const handleDragComplete = useCallback(
    (id: string, kind: "project" | "issue" | "milestone", newStart: Date, newEnd: Date) => {
      if (kind === "project") {
        updateProjectMut.mutate({
          id,
          start_date: formatDateForApi(newStart),
          target_date: formatDateForApi(newEnd),
        });
      } else if (kind === "milestone") {
        // Clamp to the project window when present.
        let s = newStart, e = newEnd;
        if (selectedProject?.start_date) {
          const ps = new Date(selectedProject.start_date);
          if (s < ps) s = ps;
        }
        if (selectedProject?.target_date) {
          const pe = new Date(selectedProject.target_date);
          if (e > pe) e = pe;
        }
        if (s >= e) e = new Date(s.getTime() + 86400000);
        updateMilestoneMut.mutate({
          id,
          start_date: formatDateForApi(s),
          target_date: formatDateForApi(e),
        });
      } else {
        updateIssueMut.mutate({
          id,
          start_date: formatDateForApi(newStart),
          due_date: newEnd.toISOString(),
        });
      }
    },
    [updateProjectMut, updateIssueMut, updateMilestoneMut, selectedProject],
  );

  const teamMap = useMemo(() => {
    const map: Record<string, Team> = {};
    for (const t of teams) map[t.id] = t;
    return map;
  }, [teams]);

  const memberMap = useMemo(() => {
    const map: Record<string, { name: string; avatar_url: string | null }> = {};
    for (const m of members) map[m.user_id] = { name: m.name, avatar_url: m.avatar_url };
    return map;
  }, [members]);

  const projectsByTeam = useMemo(() => {
    const groups: Record<string, RoadmapProject[]> = {};
    for (const p of projects) {
      const key = p.team_id;
      if (!groups[key]) groups[key] = [];
      groups[key]!.push(p);
    }
    return groups;
  }, [projects]);

  const { start: timelineStart, end: timelineEnd } = useMemo(() => getTimelineRange(projects), [projects]);
  const totalDays = daysBetween(timelineStart, timelineEnd);
  const zoomConfig = ZOOM_LEVELS.find((z) => z.value === zoom)!;
  const pxPerDay = zoomConfig.pxPerDay;
  const totalWidth = totalDays * pxPerDay;
  const columns = useMemo(() => generateTimelineColumns(timelineStart, timelineEnd, zoom), [timelineStart, timelineEnd, zoom]);

  const zoomIdx = ZOOM_LEVELS.findIndex((z) => z.value === zoom);
  const { drag, onMouseDown: onDragStart, didDragRef } = useDragBar(pxPerDay, handleDragComplete);

  const scrollToToday = useCallback(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const offset = daysBetween(timelineStart, now);
    const todayPx = offset * pxPerDay;
    scrollRef.current.scrollLeft = Math.max(todayPx - scrollRef.current.clientWidth / 3, 0);
  }, [timelineStart, pxPerDay]);

  useEffect(() => {
    if (projects.length > 0 && !hasScrolledToToday.current) {
      hasScrolledToToday.current = true;
      setTimeout(scrollToToday, 50);
    }
  }, [projects.length, scrollToToday]);

  if (selectedProject) {
    // Mode: project selected (showing milestones), or milestone selected (showing milestone's issues)
    const showingIssues = !!selectedMilestone;
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-3 px-6 py-3 border-b shrink-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (showingIssues) setSelectedMilestone(null);
              else setSelectedProject(null);
            }}
          >
            <ChevronLeft className="size-4 mr-1" /> Back
          </Button>
          <div className="flex items-center gap-1.5 text-sm">
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedMilestone(null)}
            >
              {selectedProject.title}
            </button>
            {showingIssues && (
              <>
                <ChevronLeft className="size-3 text-muted-foreground/50 rotate-180" />
                <h1 className="text-lg font-semibold flex items-center gap-1.5">
                  <Diamond className="size-4 text-primary" />
                  {selectedMilestone!.name}
                </h1>
              </>
            )}
            {!showingIssues && (
              <>
                <ChevronLeft className="size-3 text-muted-foreground/50 rotate-180" />
                <h1 className="text-lg font-semibold">Milestones</h1>
              </>
            )}
            {!showingIssues && selectedProject.health_status && (
              <span className={cn("ml-2 px-2 py-0.5 rounded text-xs border", HEALTH_CONFIG[selectedProject.health_status].className)}>
                {HEALTH_CONFIG[selectedProject.health_status].label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto text-sm text-muted-foreground">
            {showingIssues ? (
              <>
                {selectedMilestone!.start_date && selectedMilestone!.target_date && (
                  <span>
                    {new Date(selectedMilestone!.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    <ArrowRight className="inline size-3 mx-1" />
                    {new Date(selectedMilestone!.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
                <span className="text-foreground font-medium">{milestoneIssues.length} issues</span>
              </>
            ) : (
              <>
                {selectedProject.start_date && selectedProject.target_date && (
                  <span>
                    {new Date(selectedProject.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    <ArrowRight className="inline size-3 mx-1" />
                    {new Date(selectedProject.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                )}
                <span className="text-foreground font-medium">{projectMilestones.length} milestones</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-1 ml-4">
            {ZOOM_LEVELS.map((z) => (
              <Button key={z.value} variant={zoom === z.value ? "secondary" : "ghost"} size="sm" className="h-7 text-xs px-2" onClick={() => setZoom(z.value)}>
                {z.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Left panel - milestones or issues list */}
          <div className="w-80 border-r shrink-0 overflow-y-auto">
            <div className="flex items-center justify-between px-4 border-b text-xs font-medium text-muted-foreground uppercase tracking-wider" style={{ height: ROW_HEIGHT }}>
              {showingIssues
                ? `${milestoneIssues.length} Issues`
                : `${projectMilestones.length} Milestones`}
            </div>
            {/* Spacer rows aligning with the project (and milestone) header bars in the timeline */}
            <div className="border-b border-border/30 bg-muted/10" style={{ height: ROW_HEIGHT }} />
            {showingIssues && (
              <div className="border-b border-border/20 bg-muted/5" style={{ height: DETAIL_ROW_HEIGHT }} />
            )}
            {showingIssues
              ? milestoneIssues.map((issue) => {
                  const isDone = issue.status === "done" || issue.status === "cancelled";
                  const isInProgress = issue.status === "in_progress" || issue.status === "in_review";
                  const assignee = issue.assignee_id && issue.assignee_type === "member" ? memberMap[issue.assignee_id] : null;
                  return (
                    <div
                      key={issue.id}
                      className="flex items-center gap-2 px-4 text-sm border-b border-border/20 cursor-pointer hover:bg-accent/30 transition-colors"
                      style={{ height: DETAIL_ROW_HEIGHT }}
                      onClick={() => window.open(wsPaths.issueDetail(issue.id), "_blank")}
                    >
                      <span className={cn(
                        "size-2 rounded-full shrink-0",
                        isDone && "bg-green-500",
                        isInProgress && "bg-blue-500",
                        !isDone && !isInProgress && "border border-muted-foreground/50",
                      )} />
                      <span className="flex-1 truncate">{issue.title}</span>
                      {assignee && (
                        <ActorAvatar name={assignee.name} initials={assignee.name[0]!.toUpperCase()} avatarUrl={assignee.avatar_url} size={16} />
                      )}
                      {(issue.start_date || issue.due_date) && (
                        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                          {issue.start_date && issue.due_date
                            ? `${new Date(issue.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${new Date(issue.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                            : new Date(issue.due_date ?? issue.start_date!).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  );
                })
              : projectMilestones.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 px-4 text-sm border-b border-border/20 cursor-pointer hover:bg-accent/30 transition-colors"
                    style={{ height: DETAIL_ROW_HEIGHT }}
                    onClick={() => setSelectedMilestone({ id: m.id, name: m.name, start_date: m.start_date, target_date: m.target_date })}
                  >
                    <Diamond className={cn(
                      "size-3.5 shrink-0",
                      m.derived_status === "completed" && "fill-primary text-primary",
                      m.derived_status === "in_progress" && "text-primary",
                      m.derived_status === "planned" && "text-muted-foreground",
                    )} />
                    <span className="flex-1 truncate">{m.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {m.percent}% of {m.total_count}
                    </span>
                    {m.target_date && (
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
                        {new Date(m.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                ))}
          </div>

          {/* Timeline panel */}
          <div ref={scrollRef} className="flex-1 overflow-auto relative">
            <TimelineHeader columns={columns} timelineStart={timelineStart} timelineEnd={timelineEnd} pxPerDay={pxPerDay} zoom={zoom} />
            <div className="relative" style={{ width: totalWidth, minHeight: "100%" }}>
              <TodayLine timelineStart={timelineStart} pxPerDay={pxPerDay} totalDays={totalDays} />
              {/* Project header bar (always shown) */}
              <div className="border-b border-border/30">
                <ProjectBar project={selectedProject} pxPerDay={pxPerDay} timelineStart={timelineStart} onClick={() => window.open(wsPaths.projectDetail(selectedProject.id), "_blank")} drag={drag} onDragStart={onDragStart} didDragRef={didDragRef} members={memberMap} />
              </div>
              {/* Milestone header bar — only when drilled into a milestone */}
              {showingIssues && selectedMilestone && (() => {
                const projectMilestone = projectMilestones.find((m) => m.id === selectedMilestone.id);
                return projectMilestone ? (
                  <div className="border-b border-border/20">
                    <MilestoneBar
                      milestone={projectMilestone}
                      pxPerDay={pxPerDay}
                      timelineStart={timelineStart}
                      drag={drag}
                      onDragStart={onDragStart}
                      didDragRef={didDragRef}
                    />
                  </div>
                ) : null;
              })()}
              {showingIssues
                ? milestoneIssues.map((issue) => (
                    <div key={issue.id} className="border-b border-border/20">
                      <IssueBar issue={issue} pxPerDay={pxPerDay} timelineStart={timelineStart} members={memberMap} drag={drag} onDragStart={onDragStart} didDragRef={didDragRef} onClick={() => window.open(wsPaths.issueDetail(issue.id), "_blank")} />
                    </div>
                  ))
                : projectMilestones.map((m) => (
                    <MilestoneBar
                      key={m.id}
                      milestone={m}
                      pxPerDay={pxPerDay}
                      timelineStart={timelineStart}
                      drag={drag}
                      onDragStart={onDragStart}
                      didDragRef={didDragRef}
                      onClick={() => setSelectedMilestone({ id: m.id, name: m.name, start_date: m.start_date, target_date: m.target_date })}
                    />
                  ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <GanttChart className="size-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Roadmap</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-sm">
            <span className="text-muted-foreground text-xs mr-1">Team</span>
            <Button variant={teamFilter === undefined ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setTeamFilter(undefined)}>All</Button>
            {teams.map((t) => (
              <Button key={t.id} variant={teamFilter === t.id ? "secondary" : "ghost"} size="sm" className="h-7 text-xs" onClick={() => setTeamFilter(t.id)}>{t.name}</Button>
            ))}
          </div>
          <div className="w-px h-5 bg-border mx-1" />
          <div className="flex items-center gap-1">
            {ZOOM_LEVELS.map((z) => (
              <Button key={z.value} variant={zoom === z.value ? "secondary" : "ghost"} size="sm" className="h-7 text-xs px-2" onClick={() => setZoom(z.value)}>{z.label}</Button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={zoomIdx === 0} onClick={() => setZoom(ZOOM_LEVELS[zoomIdx - 1]!.value)}>
              <ZoomIn className="size-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={zoomIdx === ZOOM_LEVELS.length - 1} onClick={() => setZoom(ZOOM_LEVELS[zoomIdx + 1]!.value)}>
              <ZoomOut className="size-3.5" />
            </Button>
          </div>
          <div className="w-px h-5 bg-border mx-1" />
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={scrollToToday}>Today</Button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Left panel - projects list */}
        <div className="w-80 border-r shrink-0 overflow-y-auto">
          <div className="flex items-center justify-between px-4 border-b" style={{ height: ROW_HEIGHT }}>
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projects</span>
            <span className="text-xs text-muted-foreground">{projects.length}</span>
          </div>
          {Object.entries(projectsByTeam).map(([teamId, teamProjects]) => {
            const team = teamMap[teamId];
            return (
              <div key={teamId}>
                <div className="flex items-center gap-2 px-4 border-b border-border/30 bg-muted/30" style={{ height: TEAM_HEADER_HEIGHT }}>
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {team?.name ?? "Unknown"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{teamProjects.length}</span>
                </div>
                {teamProjects.map((project) => {
                  const pct = project.issue_count > 0
                    ? Math.round((project.done_count / project.issue_count) * 100)
                    : 0;
                  const lead = project.lead_id && project.lead_type === "member" ? memberMap[project.lead_id] : null;
                  return (
                    <button
                      key={project.id}
                      onClick={() => setSelectedProject(project)}
                      className="flex items-center gap-2 w-full px-4 text-left hover:bg-accent/50 transition-colors border-b border-border/20"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium truncate">{project.title}</span>
                          <span className={cn("size-1.5 rounded-full shrink-0", HEALTH_CONFIG[project.health_status].dot)} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                          {project.start_date && project.target_date ? (
                            <span>
                              {new Date(project.start_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              {" - "}
                              {new Date(project.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          ) : (
                            <span className="italic">No dates</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {lead && (
                          <ActorAvatar
                            name={lead.name}
                            initials={lead.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                            avatarUrl={lead.avatar_url}
                            size={18}
                          />
                        )}
                        <span className="text-xs tabular-nums text-muted-foreground">{pct}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {projects.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              No active projects found.
            </div>
          )}
        </div>

        {/* Timeline panel */}
        <div ref={scrollRef} className="flex-1 overflow-auto relative">
          <TimelineHeader columns={columns} timelineStart={timelineStart} timelineEnd={timelineEnd} pxPerDay={pxPerDay} zoom={zoom} />
          <div className="relative" style={{ width: totalWidth, minHeight: "100%" }}>
            <TodayLine timelineStart={timelineStart} pxPerDay={pxPerDay} totalDays={totalDays} />
            {/* Vertical grid lines */}
            {zoom !== "quarter" && columns.filter((_, i) => {
              if (zoom === "month") return true;
              if (zoom === "week") return columns[i]!.date.getDate() <= 7;
              return columns[i]!.date.getDate() === 1;
            }).map((col) => {
              const left = daysBetween(timelineStart, col.date) * pxPerDay;
              return (
                <div key={col.date.toISOString() + "-grid"} className="absolute top-0 bottom-0 w-px bg-border/20 pointer-events-none" style={{ left }} />
              );
            })}
            {Object.entries(projectsByTeam).map(([teamId, teamProjects]) => (
              <div key={teamId}>
                <div className="border-b border-border/30 bg-muted/10" style={{ height: TEAM_HEADER_HEIGHT }} />
                {teamProjects.map((project) => (
                  <div key={project.id} className="border-b border-border/20">
                    <ProjectBar project={project} pxPerDay={pxPerDay} timelineStart={timelineStart} onClick={() => window.open(wsPaths.projectDetail(project.id), "_blank")} drag={drag} onDragStart={onDragStart} didDragRef={didDragRef} members={memberMap} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
