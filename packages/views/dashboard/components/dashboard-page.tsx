"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { useAuthStore } from "@multica/core/auth";
import { memberListOptions } from "@multica/core/workspace/queries";
import { dashboardOptions } from "@multica/core/dashboard";
import { useNavigation } from "../../navigation";
import { useWorkspacePaths } from "@multica/core/paths";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { DashboardHeader } from "./dashboard-header";
import { DashboardStatsSection } from "./dashboard-stats";
import { TeamHealthGrid } from "./team-health-grid";
import { VelocityChart } from "./velocity-chart";
import { ActivityFeed } from "./activity-feed";

export function DashboardPage() {
  const wsId = useWorkspaceId();
  const user = useAuthStore((s) => s.user);
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const currentMember = members.find((m) => m.user_id === user?.id);
  const navigation = useNavigation();
  const p = useWorkspacePaths();

  const [cycleCount, setCycleCount] = useState(6);
  const { data, isLoading } = useQuery(dashboardOptions(wsId, cycleCount));

  const isAdminOrOwner = currentMember?.role === "owner" || currentMember?.role === "admin";
  if (currentMember && !isAdminOrOwner) {
    navigation.push(p.issues());
    return null;
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-1 flex-col gap-5 p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-8 w-36" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
      <DashboardHeader
        userName={user?.name ?? ""}
        cycleCount={cycleCount}
        onCycleCountChange={setCycleCount}
      />

      {data.teams.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">Create your first team to see dashboard metrics</p>
        </div>
      ) : (
        <>
          <DashboardStatsSection stats={data.stats} blockers={data.blockers} />

          <TeamHealthGrid teams={data.teams} blockers={data.blockers} />

          <VelocityChart velocity={data.velocity} />

          <ActivityFeed activities={data.activity} />
        </>
      )}
    </div>
  );
}
