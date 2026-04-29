"use client";

import { Check, Timer, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cycleListOptions } from "@multica/core/cycles/queries";
import { useWorkspaceId } from "@multica/core/hooks";
import type { UpdateIssueRequest, CycleStatus } from "@multica/core/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@multica/ui/components/ui/dropdown-menu";

const STATUS_ORDER: CycleStatus[] = ["active", "planned", "cooldown"];
const STATUS_LABELS: Record<CycleStatus, string> = {
  active: "Current",
  planned: "Upcoming",
  cooldown: "Cooldown",
  completed: "Past",
};

export function CyclePicker({
  cycleId,
  teamId,
  onUpdate,
  align = "start",
  triggerRender,
}: {
  cycleId: string | null;
  teamId: string;
  onUpdate: (updates: Partial<UpdateIssueRequest>) => void;
  align?: "start" | "center" | "end";
  triggerRender?: React.ReactElement;
}) {
  const wsId = useWorkspaceId();
  const { data: cycles = [] } = useQuery(cycleListOptions(wsId, teamId));
  const activeCycles = cycles.filter((c) => STATUS_ORDER.includes(c.status as CycleStatus));
  const current = cycles.find((c) => c.id === cycleId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        {...(triggerRender ? { render: triggerRender } : {})}
        className={triggerRender ? undefined : "flex items-center gap-1.5 cursor-pointer rounded px-1 -mx-1 hover:bg-accent/30 transition-colors overflow-hidden"}
      >
        <Timer className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{current ? current.name : "No cycle"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        {activeCycles.map((c) => (
          <DropdownMenuItem key={c.id} onClick={() => onUpdate({ cycle_id: c.id })}>
            <span className="truncate flex-1">{c.name}</span>
            <span className="text-xs text-muted-foreground shrink-0 ml-2">
              {STATUS_LABELS[c.status as CycleStatus] || c.status}
            </span>
            {c.id === cycleId && <Check className="ml-1 h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
        {activeCycles.length > 0 && cycleId && <DropdownMenuSeparator />}
        {cycleId && (
          <DropdownMenuItem onClick={() => onUpdate({ cycle_id: null })}>
            <X className="h-3.5 w-3.5 text-muted-foreground" />
            Remove from cycle
          </DropdownMenuItem>
        )}
        {activeCycles.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No active cycles</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
