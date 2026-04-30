"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Diamond } from "lucide-react";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { projectMilestonesOptions } from "@multica/core/milestones";
import type { Milestone } from "@multica/core/types";
import { cn } from "@multica/ui/lib/utils";
import { useNavigation } from "../../navigation";
import { MilestoneFormDialog } from "./milestone-form-dialog";

function statusColor(s: Milestone["derived_status"]) {
  if (s === "completed") return "fill-primary text-primary";
  if (s === "in_progress") return "text-primary";
  return "text-muted-foreground";
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MilestonesSection({ projectId }: { projectId: string }) {
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const navigation = useNavigation();
  const { data: milestones = [] } = useQuery(projectMilestonesOptions(wsId, projectId));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | undefined>(undefined);

  return (
    <div className="mt-8">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Milestones</h3>
      {milestones.length === 0 ? (
        <button
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => { setEditing(undefined); setDialogOpen(true); }}
        >
          + Add milestone
        </button>
      ) : (
        <div className="space-y-3">
          {milestones.map((m) => (
            <div key={m.id} className="border-b pb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditing(m); setDialogOpen(true); }}
                  title="Edit milestone"
                  className="rounded hover:bg-accent p-0.5"
                >
                  <Diamond className={cn("size-4", statusColor(m.derived_status))} />
                </button>
                <button
                  className="text-sm font-medium hover:underline"
                  onClick={() => navigation.push(`${p.projectIssues(projectId)}?milestone=${m.id}`)}
                >
                  {m.name}
                </button>
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                  {fmtDate(m.target_date)} · {m.total_count} issues · {m.percent}%
                </span>
              </div>
              {m.description && (
                <p className="mt-1 ml-6 text-xs text-muted-foreground line-clamp-2">{m.description}</p>
              )}
            </div>
          ))}
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setEditing(undefined); setDialogOpen(true); }}
          >
            <Plus className="inline size-3 mr-1" />Milestone
          </button>
        </div>
      )}
      <MilestoneFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(undefined); }}
        projectId={projectId}
        milestone={editing}
      />
    </div>
  );
}
