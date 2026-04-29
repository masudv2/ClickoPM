"use client";

import type { DashboardActivity } from "@multica/core/types";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { memberListOptions } from "@multica/core/workspace/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@multica/ui/components/ui/card";
import { CheckCircle2, PlusCircle, RefreshCw } from "lucide-react";

interface ActivityFeedProps {
  activities: DashboardActivity[];
}

const ACTION_CONFIG: Record<string, { icon: typeof CheckCircle2; label: string }> = {
  status_changed: { icon: RefreshCw, label: "Status changed" },
  issue_created: { icon: PlusCircle, label: "Issue created" },
  cycle_status_changed: { icon: CheckCircle2, label: "Cycle updated" },
};

const FALLBACK_CONFIG = { icon: RefreshCw, label: "Activity" };

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const wsId = useWorkspaceId();
  const { data: members = [] } = useQuery(memberListOptions(wsId));

  const getMemberName = (actorType: string, actorId: string) => {
    if (actorType === "member") {
      const m = members.find((m) => m.user_id === actorId);
      return m?.name ?? "Unknown";
    }
    if (actorType === "system") return "System";
    return "Agent";
  };

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-32 items-center justify-center">
          <p className="text-sm text-muted-foreground">No recent activity</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        {activities.map((activity) => {
          const config = ACTION_CONFIG[activity.action] ?? FALLBACK_CONFIG;
          const Icon = config.icon;
          const details = activity.details as Record<string, string>;
          const timeAgo = getTimeAgo(activity.created_at);

          return (
            <div key={activity.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
              <div className="rounded-md bg-muted p-1">
                <Icon className="size-3 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground truncate">
                  <span className="font-medium">{getMemberName(activity.actor_type, activity.actor_id)}</span>
                  {" "}
                  {formatAction(activity.action, details)}
                </p>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{timeAgo}</span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function formatAction(action: string, details: Record<string, string>): string {
  switch (action) {
    case "status_changed":
      return `changed status to ${details.to ?? "unknown"}`;
    case "issue_created":
      return "created an issue";
    case "cycle_status_changed":
      return "updated cycle status";
    default:
      return action.replace(/_/g, " ");
  }
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
