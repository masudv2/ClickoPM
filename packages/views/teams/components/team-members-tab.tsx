"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@multica/ui/components/ui/popover";
import { useWorkspaceId } from "@multica/core/hooks";
import { teamMemberListOptions, useAddTeamMember, useRemoveTeamMember } from "@multica/core/teams";
import { memberListOptions } from "@multica/core/workspace/queries";
import { ActorAvatar } from "../../common/actor-avatar";
import type { Team } from "@multica/core/types";

export function TeamMembersTab({ team }: { team: Team }) {
  const wsId = useWorkspaceId();
  const { data: teamMembers = [] } = useQuery(teamMemberListOptions(team.id));
  const { data: allMembers = [] } = useQuery(memberListOptions(wsId));
  const addMember = useAddTeamMember();
  const removeMember = useRemoveTeamMember();
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const teamMemberIds = new Set(teamMembers.map((m) => m.id));
  const availableMembers = allMembers.filter((m) => !teamMemberIds.has(m.id));
  const filteredMembers = search
    ? availableMembers.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()))
    : availableMembers;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Members</h2>
          <p className="text-sm text-muted-foreground">Manage who belongs to this team.</p>
        </div>
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Plus className="size-4" /> Add member
          </PopoverTrigger>
          <PopoverContent className="w-60 p-2" align="end">
            <Input
              placeholder="Search members..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2"
              autoFocus
            />
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {filteredMembers.length === 0 && (
                <p className="text-xs text-muted-foreground py-2 text-center">No available members</p>
              )}
              {filteredMembers.map((m) => (
                <button
                  key={m.id}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
                  onClick={() => {
                    addMember.mutate({ teamId: team.id, memberId: m.id }, {
                      onSuccess: () => { toast.success(`Added ${m.name}`); setAddOpen(false); setSearch(""); },
                      onError: () => toast.error("Failed to add member"),
                    });
                  }}
                >
                  <ActorAvatar actorType="member" actorId={m.user_id} size={20} />
                  <span className="flex-1 truncate text-left">{m.name}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="space-y-1">
        {teamMembers.map((m) => (
          <div key={m.id} className="flex items-center gap-3 rounded-lg border px-4 py-2.5 group hover:bg-accent/50 transition-colors">
            <ActorAvatar actorType="member" actorId={m.user_id} size={28} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{m.name}</p>
              <p className="text-xs text-muted-foreground truncate">{m.email}</p>
            </div>
            <span className="text-xs text-muted-foreground capitalize">{m.role}</span>
            <Button
              size="icon"
              variant="ghost"
              className="size-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive"
              onClick={() => {
                removeMember.mutate({ teamId: team.id, memberId: m.id }, {
                  onSuccess: () => toast.success(`Removed ${m.name}`),
                  onError: () => toast.error("Failed to remove member"),
                });
              }}
            >
              <X className="size-3.5" />
            </Button>
          </div>
        ))}
        {teamMembers.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">No members in this team.</p>
        )}
      </div>
    </div>
  );
}
