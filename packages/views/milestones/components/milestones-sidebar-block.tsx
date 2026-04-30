"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, Diamond } from "lucide-react";
import { useWorkspaceId } from "@multica/core/hooks";
import { projectMilestonesOptions } from "@multica/core/milestones";
import type { Milestone } from "@multica/core/types";
import { cn } from "@multica/ui/lib/utils";
import { MilestoneFormDialog } from "./milestone-form-dialog";

function statusFill(s: Milestone["derived_status"]) {
  if (s === "completed") return "fill-primary text-primary";
  if (s === "in_progress") return "text-primary";
  return "text-muted-foreground";
}

function shortDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MilestonesSidebarBlock({
  projectId,
  selectedId,
  onSelect,
}: {
  projectId: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const wsId = useWorkspaceId();
  const [open, setOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: milestones = [] } = useQuery(projectMilestonesOptions(wsId, projectId));

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <button
          className={cn(
            "flex flex-1 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-accent/70",
            !open && "text-muted-foreground hover:text-foreground",
          )}
          onClick={() => setOpen(!open)}
        >
          Milestones
          <ChevronRight
            className={cn(
              "!size-3 shrink-0 stroke-[2.5] text-muted-foreground transition-transform",
              open && "rotate-90",
            )}
          />
        </button>
        <button
          type="button"
          className="rounded p-1 hover:bg-accent text-muted-foreground"
          onClick={() => setDialogOpen(true)}
          title="Add milestone"
        >
          <Plus className="size-3" />
        </button>
      </div>
      {open && (
        <div className="space-y-0.5 pl-2">
          {milestones.length === 0 ? (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setDialogOpen(true)}
            >
              + Add milestone
            </button>
          ) : (
            milestones.map((m) => {
              const active = m.id === selectedId;
              return (
                <button
                  key={m.id}
                  onClick={() => onSelect?.(active ? null : m.id)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-accent",
                    active && "bg-accent",
                  )}
                >
                  <Diamond className={cn("size-3.5 shrink-0", statusFill(m.derived_status))} />
                  <span className="truncate flex-1 text-left">{m.name}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{m.percent}%</span>
                  {shortDate(m.target_date) && (
                    <span className="text-[10px] text-muted-foreground tabular-nums">{shortDate(m.target_date)}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
      <MilestoneFormDialog open={dialogOpen} onOpenChange={setDialogOpen} projectId={projectId} />
    </div>
  );
}
