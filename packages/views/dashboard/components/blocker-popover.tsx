"use client";

import type { DashboardBlocker } from "@multica/core/types";
import { Popover, PopoverContent, PopoverTrigger } from "@multica/ui/components/ui/popover";
import { Badge } from "@multica/ui/components/ui/badge";
import { AppLink } from "../../navigation";
import { useWorkspacePaths } from "@multica/core/paths";
import { AlertTriangle, Check } from "lucide-react";

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-blue-500",
};

interface BlockerPopoverProps {
  teamId: string;
  blockerCount: number;
  blockers: DashboardBlocker[];
}

export function BlockerPopover({ teamId, blockerCount, blockers }: BlockerPopoverProps) {
  const p = useWorkspacePaths();
  const teamBlockers = blockers.filter((b) => b.team_id === teamId);

  if (blockerCount === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3 text-emerald-500" />
        No blockers
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger className="flex items-center gap-1 text-xs text-destructive hover:underline">
        <AlertTriangle className="size-3" />
        {blockerCount} blocker{blockerCount !== 1 ? "s" : ""}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-2">
          <p className="text-sm font-medium">Blockers</p>
          {teamBlockers.map((b) => (
            <div key={b.id} className="flex items-start gap-2 rounded border p-2">
              <div className="min-w-0 flex-1">
                <AppLink href={p.issueDetail(b.id)} className="text-sm font-medium hover:underline">
                  {b.identifier}
                </AppLink>
                <p className="truncate text-xs text-muted-foreground">{b.title}</p>
              </div>
              <Badge variant="outline" className={`shrink-0 text-xs ${PRIORITY_COLORS[b.priority] ?? ""}`}>
                {b.priority}
              </Badge>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
