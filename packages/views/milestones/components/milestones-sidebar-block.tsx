"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, Diamond, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useWorkspaceId } from "@multica/core/hooks";
import { projectMilestonesOptions, useDeleteMilestone } from "@multica/core/milestones";
import type { Milestone } from "@multica/core/types";
import { cn } from "@multica/ui/lib/utils";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@multica/ui/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@multica/ui/components/ui/alert-dialog";
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
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | undefined>(undefined);
  const [deleting, setDeleting] = useState<Milestone | undefined>(undefined);
  const { data: milestones = [] } = useQuery(projectMilestonesOptions(wsId, projectId));
  const deleteMutation = useDeleteMilestone(projectId);

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      await deleteMutation.mutateAsync(deleting.id);
      if (selectedId === deleting.id) onSelect?.(null);
      setDeleting(undefined);
    } catch {
      toast.error("Failed to delete milestone");
    }
  };

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
          onClick={() => setCreateDialogOpen(true)}
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
              onClick={() => setCreateDialogOpen(true)}
            >
              + Add milestone
            </button>
          ) : (
            milestones.map((m) => {
              const active = m.id === selectedId;
              return (
                <div
                  key={m.id}
                  className={cn(
                    "group/ms flex items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-accent",
                    active && "bg-accent",
                  )}
                >
                  <button
                    onClick={() => onSelect?.(active ? null : m.id)}
                    className="flex flex-1 items-center gap-1.5 min-w-0"
                  >
                    <Diamond className={cn("size-3.5 shrink-0", statusFill(m.derived_status))} />
                    <span className="truncate flex-1 text-left">{m.name}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{m.percent}% of {m.total_count}</span>
                  </button>
                  {active ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelect?.(null); }}
                      className="text-[10px] text-primary hover:underline shrink-0 px-1"
                    >
                      Clear filter
                    </button>
                  ) : (
                    shortDate(m.target_date) && (
                      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{shortDate(m.target_date)}</span>
                    )
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          className={cn(
                            "rounded p-0.5 hover:bg-accent-foreground/10 shrink-0",
                            !active && "opacity-0 group-hover/ms:opacity-100",
                          )}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="size-3 text-muted-foreground" />
                        </button>
                      }
                    />
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setEditing(m)}>
                        <Pencil className="size-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => setDeleting(m)}
                        className="text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })
          )}
        </div>
      )}
      <MilestoneFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        projectId={projectId}
      />
      {editing && (
        <MilestoneFormDialog
          open={!!editing}
          onOpenChange={(v) => { if (!v) setEditing(undefined); }}
          projectId={projectId}
          milestone={editing}
        />
      )}
      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v) setDeleting(undefined); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete milestone</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-medium">{deleting?.name}</span>? Issues belonging to this milestone will move to <span className="font-medium">No milestone</span>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-white hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
