"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { useAuthStore } from "@multica/core/auth";
import { memberListOptions } from "@multica/core/workspace/queries";
import { workloadOptions, workloadIssuesOptions } from "@multica/core/workload";
import { useNavigation } from "../../navigation";
import { useWorkspacePaths } from "@multica/core/paths";
import { useActorName } from "@multica/core/workspace/hooks";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { Card, CardContent } from "@multica/ui/components/ui/card";
import { Button } from "@multica/ui/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@multica/ui/components/ui/collapsible";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import { ActorAvatar } from "../../common/actor-avatar";
import { StatusIcon } from "../../issues/components/status-icon";
import { PriorityIcon } from "../../issues/components/priority-icon";
import { ChevronRight, Users, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";
import { cn } from "@multica/ui/lib/utils";
import type { WorkloadTeam, WorkloadMember, IssueStatus, IssuePriority, Team } from "@multica/core/types";
import { teamListOptions } from "@multica/core/teams";
import { getEstimateScale, formatEstimateShort, estimateUnit, type EstimateScale } from "@multica/core/issues/config";

type ViewMode = "points" | "issues";

function getCapacityColor(percent: number) {
  if (percent > 100) return "text-destructive";
  if (percent >= 80) return "text-amber-500";
  return "text-emerald-500";
}

function getCapacityBg(percent: number) {
  if (percent > 100) return "bg-destructive";
  if (percent >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

function computeStats(teams: WorkloadTeam[]) {
  let total = 0;
  let overloaded = 0;
  let nearCapacity = 0;
  let available = 0;

  for (const team of teams) {
    for (const m of team.members) {
      total++;
      if (m.capacity_percent > 100) overloaded++;
      else if (m.capacity_percent >= 80) nearCapacity++;
      else available++;
    }
  }

  return { total, overloaded, nearCapacity, available };
}

function StatCard({ label, value, icon: Icon, variant }: {
  label: string;
  value: number;
  icon: typeof Users;
  variant: "default" | "destructive" | "warning" | "success";
}) {
  const colorMap = {
    default: "text-foreground",
    destructive: "text-destructive",
    warning: "text-amber-500",
    success: "text-emerald-500",
  };

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn("rounded-md bg-muted p-2", colorMap[variant])}>
          <Icon className="size-4" />
        </div>
        <div>
          <p className="text-2xl font-semibold leading-none">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function CapacityBar({ member, mode }: { member: WorkloadMember; mode: ViewMode }) {
  const capacity = member.capacity;
  if (capacity === 0) return <span className="text-xs text-muted-foreground">No history</span>;

  const total = mode === "points" ? member.assigned_points : member.issue_count;
  const completed = mode === "points" ? member.completed_points : member.completed_issue_count;
  const percent = member.capacity_percent;
  const barMax = Math.max(percent, 100);
  const completedWidth = capacity > 0 ? (completed / capacity) * 100 : 0;
  const remainingWidth = capacity > 0 ? ((total - completed) / capacity) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="flex h-full" style={{ width: `${Math.min((percent / barMax) * 100, 100)}%` }}>
          <div
            className="h-full bg-blue-500"
            style={{ width: `${Math.min(completedWidth, 100)}%` }}
          />
          <div
            className={cn("h-full", getCapacityBg(percent))}
            style={{ width: `${Math.min(remainingWidth, 100 - completedWidth)}%` }}
          />
        </div>
      </div>
      <span className={cn("min-w-[3rem] text-right text-xs font-medium", getCapacityColor(percent))}>
        {Math.round(percent)}%
      </span>
    </div>
  );
}

function MemberIssuesRow({ wsId, assigneeType, assigneeId, scale }: {
  wsId: string;
  assigneeType: string;
  assigneeId: string;
  scale: EstimateScale;
}) {
  const { data: issues, isLoading } = useQuery(workloadIssuesOptions(wsId, assigneeType, assigneeId));
  const p = useWorkspacePaths();

  if (isLoading) {
    return (
      <div className="space-y-1 py-2 pl-12">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-full" />
        ))}
      </div>
    );
  }

  if (!issues || issues.length === 0) {
    return (
      <div className="py-2 pl-12 text-xs text-muted-foreground">No issues assigned</div>
    );
  }

  return (
    <div className="space-y-0.5 py-1 pl-12">
      {issues.map((issue) => (
        <button
          key={issue.id}
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
          onClick={() => {
            window.open(
              `${window.location.origin}${p.issueDetail(issue.id)}`,
              "_blank",
            );
          }}
        >
          <PriorityIcon priority={issue.priority as IssuePriority} className="size-3.5 shrink-0" />
          <StatusIcon status={issue.status as IssueStatus} className="size-3.5 shrink-0" />
          <span className="shrink-0 text-xs text-muted-foreground">{issue.identifier}</span>
          <span className="min-w-0 flex-1 truncate">{issue.title}</span>
          {issue.estimate !== null && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {formatEstimateShort(issue.estimate, scale)}{estimateUnit(scale) ? ` ${estimateUnit(scale)}` : ""}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function MemberRow({ wsId, member, mode, scale }: {
  wsId: string;
  member: WorkloadMember;
  mode: ViewMode;
  scale: EstimateScale;
}) {
  const [expanded, setExpanded] = useState(false);
  const { getActorName } = useActorName();
  const name = getActorName(member.assignee_type, member.assignee_id);
  const total = mode === "points" ? member.assigned_points : member.issue_count;
  const completed = mode === "points" ? member.completed_points : member.completed_issue_count;
  const capacity = member.capacity;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CollapsibleTrigger className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted">
        <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")} />
        <ActorAvatar actorType={member.assignee_type} actorId={member.assignee_id} size={24} />
        <span className="min-w-0 flex-1 truncate text-left font-medium">{name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {completed}/{total} {mode === "points" ? (estimateUnit(scale) || "pts") : "issues"}
        </span>
        <Tooltip>
          <TooltipTrigger render={<span />} className="shrink-0 text-xs text-muted-foreground">
            cap: {capacity}
          </TooltipTrigger>
          <TooltipContent>Avg velocity from last 3 cycles</TooltipContent>
        </Tooltip>
        <div className="w-32 shrink-0">
          <CapacityBar member={member} mode={mode} />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <MemberIssuesRow wsId={wsId} assigneeType={member.assignee_type} assigneeId={member.assignee_id} scale={scale} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function TeamSection({ wsId, team, mode, teams }: {
  wsId: string;
  team: WorkloadTeam;
  mode: ViewMode;
  teams: Team[];
}) {
  const scale = getEstimateScale(teams.find((t) => t.id === team.team_id)?.settings);
  const unit = estimateUnit(scale) || "pts";
  const totalPoints = team.members.reduce((s, m) => s + m.assigned_points, 0);
  const totalIssues = team.members.reduce((s, m) => s + m.issue_count, 0);
  const totalCapacity = team.members.reduce((s, m) => s + m.capacity, 0);
  const teamValue = mode === "points" ? totalPoints : totalIssues;

  const startDate = new Date(team.cycle_starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endDate = new Date(team.cycle_ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="size-3 rounded" style={{ backgroundColor: team.team_color }} />
        <h3 className="text-sm font-semibold">{team.team_name}</h3>
        <span className="text-xs text-muted-foreground">
          {team.cycle_name} &middot; {startDate} - {endDate}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {teamValue} / {totalCapacity} {mode === "points" ? unit : "issues"}
        </span>
      </div>
      <div className="rounded-lg border bg-card">
        {team.members.map((member) => (
          <MemberRow
            key={`${member.assignee_type}-${member.assignee_id}`}
            wsId={wsId}
            member={member}
            mode={mode}
            scale={scale}
          />
        ))}
      </div>
    </div>
  );
}

export function WorkloadPage() {
  const wsId = useWorkspaceId();
  const user = useAuthStore((s) => s.user);
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const currentMember = members.find((m) => m.user_id === user?.id);
  const navigation = useNavigation();
  const p = useWorkspacePaths();
  const [mode, setMode] = useState<ViewMode>("points");

  const { data, isLoading } = useQuery(workloadOptions(wsId));
  const { data: allTeams = [] } = useQuery(teamListOptions(wsId));

  const isAdminOrOwner = currentMember?.role === "owner" || currentMember?.role === "admin";
  if (currentMember && !isAdminOrOwner) {
    navigation.push(p.issues());
    return null;
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-1 flex-col gap-5 p-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-8 w-36" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  const stats = computeStats(data.teams);

  return (
    <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Workload</h1>
          <p className="text-sm text-muted-foreground">Team capacity across active cycles</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-muted p-0.5">
          <Button
            variant={mode === "points" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setMode("points")}
          >
            Points
          </Button>
          <Button
            variant={mode === "issues" ? "secondary" : "ghost"}
            size="xs"
            onClick={() => setMode("issues")}
          >
            Issues
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Total Members" value={stats.total} icon={Users} variant="default" />
        <StatCard label="Overloaded" value={stats.overloaded} icon={AlertTriangle} variant="destructive" />
        <StatCard label="Near Capacity" value={stats.nearCapacity} icon={Clock} variant="warning" />
        <StatCard label="Available" value={stats.available} icon={CheckCircle2} variant="success" />
      </div>

      {data.teams.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">No active cycles with assigned issues</p>
        </div>
      ) : (
        <div className="space-y-6">
          {data.teams.map((team) => (
            <TeamSection key={team.team_id} wsId={wsId} team={team} mode={mode} teams={allTeams} />
          ))}
        </div>
      )}
    </div>
  );
}
