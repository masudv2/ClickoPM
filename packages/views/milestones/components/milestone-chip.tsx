"use client";

import { Diamond } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import { useWorkspacePaths } from "@multica/core/paths";
import { useNavigation } from "../../navigation";

export function MilestoneChip({
  milestoneId,
  milestoneName,
  projectId,
  className = "",
}: {
  milestoneId: string;
  milestoneName: string;
  projectId?: string;
  className?: string;
}) {
  const navigation = useNavigation();
  const p = useWorkspacePaths();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="link"
            tabIndex={0}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded text-xs text-muted-foreground max-w-[160px] hover:text-foreground ${className}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (projectId) {
                navigation.push(`${p.projectIssues(projectId)}?milestone=${milestoneId}`);
              }
            }}
          >
            <Diamond className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{milestoneName}</span>
          </span>
        }
      />
      <TooltipContent>{milestoneName}</TooltipContent>
    </Tooltip>
  );
}
