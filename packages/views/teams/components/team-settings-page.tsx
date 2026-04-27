"use client";

import { useQuery } from "@tanstack/react-query";
import { Settings, Users, Timer, MessageSquare } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@multica/ui/components/ui/tabs";
import { useWorkspaceId } from "@multica/core/hooks";
import { teamListOptions } from "@multica/core/teams";
import { TeamGeneralTab } from "./team-general-tab";
import { TeamMembersTab } from "./team-members-tab";
import { TeamCyclesTab } from "./team-cycles-tab";
import { TeamSlackTab } from "./team-slack-tab";

const tabs = [
  { value: "general", label: "General", icon: Settings },
  { value: "members", label: "Members", icon: Users },
  { value: "cycles", label: "Cycles", icon: Timer },
  { value: "slack", label: "Slack", icon: MessageSquare },
];

export function TeamSettingsPage({ teamIdentifier }: { teamIdentifier: string }) {
  const wsId = useWorkspaceId();
  const { data: teams = [] } = useQuery(teamListOptions(wsId));
  const team = teams.find((t) => t.identifier.toLowerCase() === teamIdentifier.toLowerCase());

  if (!team) {
    return <div className="p-6 text-muted-foreground">Team not found.</div>;
  }

  return (
    <Tabs defaultValue="general" orientation="vertical" className="flex-1 min-h-0 gap-0">
      <div className="w-52 shrink-0 border-r overflow-y-auto p-4">
        <h1 className="text-sm font-semibold mb-4 px-2">{team.name} Settings</h1>
        <TabsList variant="line" className="flex-col items-stretch">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="w-full max-w-3xl mx-auto p-6">
          <TabsContent value="general"><TeamGeneralTab team={team} /></TabsContent>
          <TabsContent value="members"><TeamMembersTab team={team} /></TabsContent>
          <TabsContent value="cycles"><TeamCyclesTab team={team} /></TabsContent>
          <TabsContent value="slack"><TeamSlackTab team={team} /></TabsContent>
        </div>
      </div>
    </Tabs>
  );
}
