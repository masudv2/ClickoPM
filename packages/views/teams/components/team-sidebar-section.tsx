"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, MoreHorizontal, Settings, Link2, LogOut, ListTodo, Timer, FolderKanban } from "lucide-react";
import { AppLink } from "../../navigation";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { teamListOptions } from "@multica/core/teams";
import { projectListOptions } from "@multica/core/projects/queries";
import type { Team } from "@multica/core/types";
import { Popover, PopoverTrigger, PopoverContent } from "@multica/ui/components/ui/popover";
import { LABEL_COLOR_CONFIG } from "@multica/core/labels";

function TeamIcon({ team }: { team: Team }) {
  const cfg = LABEL_COLOR_CONFIG[team.color as keyof typeof LABEL_COLOR_CONFIG] ?? LABEL_COLOR_CONFIG.blue;
  return (
    <span className={`inline-flex size-5 items-center justify-center rounded text-[10px] font-bold text-white ${cfg.dot}`}>
      {team.icon || team.name.charAt(0).toUpperCase()}
    </span>
  );
}

function TeamProjectsList({ teamId, teamIdentifier }: { teamId: string; teamIdentifier: string }) {
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const { data: allProjects = [] } = useQuery(projectListOptions(wsId));
  const teamProjects = allProjects.filter((proj) => proj.team_id === teamId);

  if (teamProjects.length === 0) {
    return <p className="pl-10 text-xs text-muted-foreground py-1">No projects</p>;
  }

  return (
    <>
      {teamProjects.map((proj) => {
        const total = proj.issue_count || 0;
        const done = proj.done_count || 0;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        return (
          <AppLink
            key={proj.id}
            href={p.teamProjectDetail(teamIdentifier, proj.id)}
            className="flex items-center gap-2 rounded-md px-2 py-1 pl-10 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <span className="size-2 rounded-full bg-primary shrink-0" />
            <span className="flex-1 truncate">{proj.title}</span>
            <span className="text-xs tabular-nums">{pct}%</span>
          </AppLink>
        );
      })}
    </>
  );
}

function TeamContextMenu({ team }: { team: Team }) {
  const p = useWorkspacePaths();
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="opacity-0 group-hover/team:opacity-100 rounded p-0.5 hover:bg-accent transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <MoreHorizontal className="size-4" />
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        <AppLink
          href={p.teamSettings(team.identifier)}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
          onClick={() => setOpen(false)}
        >
          <Settings className="size-4" /> Team settings
        </AppLink>
        <button
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
          onClick={() => {
            navigator.clipboard.writeText(window.location.origin + p.teamIssues(team.identifier));
            setOpen(false);
          }}
        >
          <Link2 className="size-4" /> Copy link
        </button>
        <div className="my-1 border-t" />
        <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-destructive hover:bg-accent transition-colors">
          <LogOut className="size-4" /> Leave team
        </button>
      </PopoverContent>
    </Popover>
  );
}

function TeamNavItem({ team }: { team: Team }) {
  const [expanded, setExpanded] = useState(true);
  const [projectsExpanded, setProjectsExpanded] = useState(false);
  const p = useWorkspacePaths();

  return (
    <div>
      <div className="group/team flex items-center gap-1 rounded-md px-2 py-1 hover:bg-accent/60 transition-colors">
        <button onClick={() => setExpanded(!expanded)} className="shrink-0 p-0.5">
          <ChevronRight className={`size-3.5 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} />
        </button>
        <TeamIcon team={team} />
        <button onClick={() => setExpanded(!expanded)} className="flex-1 text-left text-sm font-medium truncate">
          {team.name}
        </button>
        <AppLink
          href={p.teamIssues(team.identifier)}
          className="opacity-0 group-hover/team:opacity-100 rounded p-0.5 hover:bg-accent transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          <Plus className="size-4" />
        </AppLink>
        <TeamContextMenu team={team} />
      </div>

      {expanded && (
        <div className="ml-2">
          <AppLink
            href={p.teamIssues(team.identifier)}
            className="flex items-center gap-2 rounded-md px-2 py-1 pl-7 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ListTodo className="size-4" /> Issues
          </AppLink>
          <AppLink
            href={p.teamCycles(team.identifier)}
            className="flex items-center gap-2 rounded-md px-2 py-1 pl-7 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <Timer className="size-4" /> Cycles
          </AppLink>
          <div>
            <button
              onClick={() => setProjectsExpanded(!projectsExpanded)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 pl-7 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <FolderKanban className="size-4" />
              <span className="flex-1 text-left">Projects</span>
              <ChevronRight className={`size-3 transition-transform ${projectsExpanded ? "rotate-90" : ""}`} />
            </button>
            {projectsExpanded && <TeamProjectsList teamId={team.id} teamIdentifier={team.identifier} />}
          </div>
        </div>
      )}
    </div>
  );
}

export function TeamSidebarSection() {
  const wsId = useWorkspaceId();
  const { data: teams = [] } = useQuery(teamListOptions(wsId));

  return (
    <div className="space-y-0.5">
      <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">Your teams</p>
      {teams.map((team) => (
        <TeamNavItem key={team.id} team={team} />
      ))}
    </div>
  );
}
