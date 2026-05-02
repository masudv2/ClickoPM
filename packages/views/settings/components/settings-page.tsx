"use client";

import React from "react";
import { User, Palette, Key, Settings, Users, FolderGit2, Tag, UsersRound, Shield, Briefcase } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@multica/ui/components/ui/tabs";
import { useCurrentWorkspace } from "@multica/core/paths";
import { useWorkspaceId } from "@multica/core/hooks";
import { useAuthStore } from "@multica/core/auth";
import { memberListOptions } from "@multica/core/workspace/queries";
import { AccountTab } from "./account-tab";
import { AppearanceTab } from "./appearance-tab";
import { TokensTab } from "./tokens-tab";
import { WorkspaceTab } from "./workspace-tab";
import { MembersTab } from "./members-tab";
import { RepositoriesTab } from "./repositories-tab";
import { LabelsSettingsTab } from "../../labels/components/labels-settings-tab";
import { TeamsSettingsTab } from "../../teams/components/teams-settings-tab";
import { SLAPoliciesTab } from "../../tickets/components/sla-policies-tab";
import { ClientsTab } from "../../tickets/components/clients-tab";

const accountTabs = [
  { value: "profile", label: "Profile", icon: User },
  { value: "appearance", label: "Appearance", icon: Palette },
  { value: "tokens", label: "API Tokens", icon: Key },
];

const workspaceTabs = [
  { value: "workspace", label: "General", icon: Settings },
  { value: "repositories", label: "Repositories", icon: FolderGit2 },
  { value: "members", label: "Members", icon: Users },
  { value: "labels", label: "Labels", icon: Tag },
  { value: "teams", label: "Teams", icon: UsersRound },
  { value: "sla-policies", label: "SLA Policies", icon: Shield },
  { value: "clients", label: "Clients", icon: Briefcase },
];

export interface ExtraSettingsTab {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  content: React.ReactNode;
}

interface SettingsPageProps {
  /** Additional tabs injected by platform (e.g. desktop daemon settings) */
  extraAccountTabs?: ExtraSettingsTab[];
}

export function SettingsPage({ extraAccountTabs }: SettingsPageProps = {}) {
  const workspaceName = useCurrentWorkspace()?.name;
  const wsId = useWorkspaceId();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const role = members.find((m) => m.user_id === userId)?.role;
  const isAdminOrOwner = role === "owner" || role === "admin";

  // Members can only see their profile. Account extras (Appearance, API Tokens)
  // and the entire workspace section are hidden for non-admins.
  const visibleAccountTabs = isAdminOrOwner ? accountTabs : accountTabs.filter((t) => t.value === "profile");
  const showWorkspaceTabs = isAdminOrOwner;
  const showAccountExtras = isAdminOrOwner;

  return (
    <Tabs defaultValue="profile" orientation="vertical" className="flex-1 min-h-0 gap-0">
      {/* Left nav */}
      <div className="w-52 shrink-0 border-r overflow-y-auto p-4">
        <h1 className="text-sm font-semibold mb-4 px-2">Settings</h1>
        <TabsList variant="line" className="flex-col items-stretch">
          {/* My Account group */}
          <span className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
            My Account
          </span>
          {visibleAccountTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}
          {showAccountExtras && extraAccountTabs?.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </TabsTrigger>
          ))}

          {showWorkspaceTabs && (
            <>
              {/* Workspace group */}
              <span className="px-2 pb-1 pt-4 text-xs font-medium text-muted-foreground truncate">
                {workspaceName ?? "Workspace"}
              </span>
              {workspaceTabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </TabsTrigger>
              ))}
            </>
          )}
        </TabsList>
      </div>

      {/* Right content */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="w-full max-w-3xl mx-auto p-6">
          <TabsContent value="profile"><AccountTab /></TabsContent>
          {isAdminOrOwner && (
            <>
              <TabsContent value="appearance"><AppearanceTab /></TabsContent>
              <TabsContent value="tokens"><TokensTab /></TabsContent>
              <TabsContent value="workspace"><WorkspaceTab /></TabsContent>
              <TabsContent value="repositories"><RepositoriesTab /></TabsContent>
              <TabsContent value="members"><MembersTab /></TabsContent>
              <TabsContent value="labels"><LabelsSettingsTab /></TabsContent>
              <TabsContent value="teams"><TeamsSettingsTab /></TabsContent>
              <TabsContent value="sla-policies"><SLAPoliciesTab /></TabsContent>
              <TabsContent value="clients"><ClientsTab /></TabsContent>
              {extraAccountTabs?.map((tab) => (
                <TabsContent key={tab.value} value={tab.value}>{tab.content}</TabsContent>
              ))}
            </>
          )}
        </div>
      </div>
    </Tabs>
  );
}
