"use client";

import { useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { teamListOptions } from "@multica/core/teams";
import { cycleDetailOptions } from "@multica/core/cycles/queries";
import { issueListOptions } from "@multica/core/issues/queries";
import { useUpdateIssue } from "@multica/core/issues/mutations";
import { STATUS_ORDER } from "@multica/core/issues/config";
import { createIssueViewStore } from "@multica/core/issues/stores/view-store";
import { ViewStoreProvider } from "@multica/core/issues/stores/view-store-context";
import type { CycleWithProgress, IssueStatus } from "@multica/core/types";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { Button } from "@multica/ui/components/ui/button";
import { useModalStore } from "@multica/core/modals";
import { AppLink } from "../../navigation";
import { ListView } from "../../issues/components/list-view";
import { BatchActionToolbar } from "../../issues/components/batch-action-toolbar";
import { CycleSidebar } from "./cycle-sidebar";

const cycleViewStore = createIssueViewStore("cycle_issues_view");

export function CycleDetailPage({ cycleId, teamIdentifier }: { cycleId: string; teamIdentifier: string }) {
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const { data: teams = [] } = useQuery({ ...teamListOptions(wsId), enabled: !!teamIdentifier });
  const team = teams.find((t) => t.identifier.toLowerCase() === teamIdentifier.toLowerCase());
  const teamId = team?.id ?? "";

  const { data: cycle, isLoading } = useQuery(cycleDetailOptions(wsId, cycleId));
  const { data: allIssues = [] } = useQuery(issueListOptions(wsId, teamId));
  const updateIssueMutation = useUpdateIssue();

  const handleMoveIssue = useCallback(
    (issueId: string, newStatus: IssueStatus, newPosition?: number) => {
      const viewState = cycleViewStore.getState();
      if (viewState.sortBy !== "position") {
        viewState.setSortBy("position");
        viewState.setSortDirection("asc");
      }
      const updates: Partial<{ status: IssueStatus; position: number }> = { status: newStatus };
      if (newPosition !== undefined) updates.position = newPosition;
      updateIssueMutation.mutate(
        { id: issueId, ...updates },
        { onError: () => toast.error("Failed to move issue") },
      );
    },
    [updateIssueMutation],
  );

  const cycleIssues = useMemo(
    () => allIssues.filter((i) => i.cycle_id === cycleId),
    [allIssues, cycleId],
  );

  const visibleStatuses = useMemo(
    () => STATUS_ORDER.filter((s) => cycleIssues.some((i) => i.status === s)),
    [cycleIssues],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="flex items-center gap-2 border-b px-6 py-3">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Cycle not found.</p>
        <AppLink href={p.teamCycles(teamIdentifier)} className="text-primary hover:underline">
          <ChevronLeft className="inline size-3.5 mr-0.5" />Back to cycles
        </AppLink>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Issues list */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <AppLink
              href={p.teamCycles(teamIdentifier)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {team?.name ?? teamIdentifier}
            </AppLink>
            <ChevronRight className="size-3 text-muted-foreground/50" />
            <div className="flex items-center gap-1.5">
              <RefreshCw className="size-3.5 text-blue-400" />
              <span className="text-sm font-medium truncate">{cycle.name}</span>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs text-muted-foreground"
            onClick={() => useModalStore.getState().open("create-issue", { team_id: teamId, cycle_id: cycleId })}
          >
            <Plus className="size-3.5" />
            New Issue
          </Button>
        </div>

        {/* Issue list with native ListView */}
        <ViewStoreProvider store={cycleViewStore}>
          {cycleIssues.length === 0 ? (
            <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3">
              <RefreshCw className="size-10 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">No issues in this cycle</p>
              <p className="text-xs text-muted-foreground/70">
                Assign issues to this cycle from the issue context menu.
              </p>
            </div>
          ) : (
            <ListView issues={cycleIssues} visibleStatuses={visibleStatuses} teamId={teamId} onMoveIssue={handleMoveIssue} />
          )}
          <BatchActionToolbar teamId={teamId} />
        </ViewStoreProvider>
      </div>

      {/* Right sidebar */}
      <div className="w-80 shrink-0 border-l overflow-y-auto hidden lg:flex lg:flex-col">
        <CycleSidebar cycle={cycle as CycleWithProgress} />
      </div>
    </div>
  );
}
