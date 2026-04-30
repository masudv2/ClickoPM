"use client";

import { Check, Diamond, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { projectMilestonesOptions } from "@multica/core/milestones";
import { useWorkspaceId } from "@multica/core/hooks";
import type { UpdateIssueRequest } from "@multica/core/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@multica/ui/components/ui/dropdown-menu";

export function MilestonePicker({
  projectId,
  milestoneId,
  onUpdate,
  align = "start",
  triggerRender,
}: {
  projectId: string | null;
  milestoneId: string | null | undefined;
  onUpdate: (updates: Partial<UpdateIssueRequest>) => void;
  align?: "start" | "center" | "end";
  triggerRender?: React.ReactElement;
}) {
  const wsId = useWorkspaceId();
  const { data: milestones = [] } = useQuery({
    ...projectMilestonesOptions(wsId, projectId ?? ""),
    enabled: !!projectId,
  });
  const current = milestones.find((m) => m.id === milestoneId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={!projectId}
        {...(triggerRender ? { render: triggerRender } : {})}
        className={triggerRender ? undefined : "flex items-center gap-1.5 cursor-pointer rounded px-1 -mx-1 hover:bg-accent/30 transition-colors overflow-hidden disabled:cursor-not-allowed disabled:opacity-50"}
      >
        <Diamond className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{current ? current.name : projectId ? "No milestone" : "Pick a project first"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        {milestones.map((m) => (
          <DropdownMenuItem key={m.id} onClick={() => onUpdate({ milestone_id: m.id })}>
            <Diamond className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1">{m.name}</span>
            <span className="text-xs text-muted-foreground shrink-0 ml-2">{m.percent}%</span>
            {m.id === milestoneId && <Check className="ml-1 h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
        {milestones.length > 0 && milestoneId && <DropdownMenuSeparator />}
        {milestoneId && (
          <DropdownMenuItem onClick={() => onUpdate({ milestone_id: null })}>
            <X className="h-3.5 w-3.5 text-muted-foreground" />
            Remove milestone
          </DropdownMenuItem>
        )}
        {milestones.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No milestones</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
