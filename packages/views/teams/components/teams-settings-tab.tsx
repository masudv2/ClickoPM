"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { useWorkspaceId } from "@multica/core/hooks";
import { teamListOptions } from "@multica/core/teams";
import { useCreateTeam, useDeleteTeam } from "@multica/core/teams";
import { useWorkspacePaths } from "@multica/core/paths";
import { useNavigation } from "../../navigation";
import { LABEL_COLOR_CONFIG, LABEL_COLORS } from "@multica/core/labels";
import type { LabelColor } from "@multica/core/types";

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TeamsSettingsTab() {
  const wsId = useWorkspaceId();
  const { data: teams = [] } = useQuery(teamListOptions(wsId));
  const createTeam = useCreateTeam();
  const deleteTeam = useDeleteTeam();
  const p = useWorkspacePaths();
  const nav = useNavigation();

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");

  function handleNameChange(val: string) {
    setName(val);
    if (!identifier || identifier === name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4)) {
      setIdentifier(val.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Teams</h2>
          <p className="text-sm text-muted-foreground">Manage teams in your workspace.</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} disabled={showCreate}>
          <Plus className="size-4 mr-1" /> Create team
        </Button>
      </div>

      {showCreate && (
        <div className="mb-4 rounded-lg border p-4 space-y-3">
          <Input placeholder="Team name" value={name} onChange={(e) => handleNameChange(e.target.value)} autoFocus />
          <Input placeholder="Identifier (e.g. SAL)" value={identifier} onChange={(e) => setIdentifier(e.target.value.toUpperCase())} />
          <div className="flex flex-wrap gap-2">
            {LABEL_COLORS.map((c) => {
              const cfg = LABEL_COLOR_CONFIG[c];
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`size-5 rounded-full ${cfg.dot} ${c === color ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:ring-1 hover:ring-muted-foreground"}`}
                />
              );
            })}
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!name.trim() || !identifier.trim() || createTeam.isPending}
              onClick={() => {
                createTeam.mutate({ name: name.trim(), identifier: identifier.trim(), color }, {
                  onSuccess: () => { setShowCreate(false); setName(""); setIdentifier(""); toast.success("Team created"); },
                  onError: () => toast.error("Failed to create team"),
                });
              }}
            >
              {createTeam.isPending ? "Creating..." : "Create"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setName(""); setIdentifier(""); }}>Cancel</Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border">
        <div className="grid grid-cols-[1fr_100px_80px_80px_90px_40px] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground border-b">
          <span>Name</span>
          <span>Identifier</span>
          <span>Members</span>
          <span>Issues</span>
          <span>Created</span>
          <span />
        </div>
        {teams.map((team) => {
          const cfg = LABEL_COLOR_CONFIG[team.color as keyof typeof LABEL_COLOR_CONFIG] ?? LABEL_COLOR_CONFIG.blue;
          return (
            <div key={team.id} className="grid grid-cols-[1fr_100px_80px_80px_90px_40px] gap-4 items-center px-4 py-2.5 text-sm hover:bg-accent/50 transition-colors group">
              <span className="flex items-center gap-2">
                <span className={`inline-flex size-5 items-center justify-center rounded text-[10px] font-bold text-white ${cfg.dot}`}>
                  {team.icon || team.name.charAt(0).toUpperCase()}
                </span>
                {team.name}
              </span>
              <span className="text-muted-foreground">{team.identifier}</span>
              <span className="text-muted-foreground">{team.member_count}</span>
              <span className="text-muted-foreground">{team.issue_count}</span>
              <span className="text-muted-foreground">{formatDate(team.created_at)}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  onClick={() => nav.push(p.teamSettings(team.identifier))}
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => {
                    deleteTeam.mutate(team.id, {
                      onSuccess: () => toast.success("Team deleted"),
                      onError: () => toast.error("Failed to delete team"),
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {teams.length === 0 && !showCreate && (
          <p className="text-sm text-muted-foreground py-8 text-center">No teams yet.</p>
        )}
      </div>
    </div>
  );
}
