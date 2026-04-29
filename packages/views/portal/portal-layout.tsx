"use client";

import type { ReactNode } from "react";
import { useAuthStore } from "@multica/core/auth";
import { useCurrentWorkspace } from "@multica/core/paths";
import { Button } from "@multica/ui/components/ui/button";
import { Plus, LogOut } from "lucide-react";
import { WorkspaceAvatar } from "../workspace/workspace-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@multica/ui/components/ui/dropdown-menu";
import { ActorAvatar } from "@multica/ui/components/common/actor-avatar";
import { DashboardGuard } from "../layout/dashboard-guard";

interface PortalLayoutProps {
  children: ReactNode;
  onNewTicket?: () => void;
}

export function PortalLayout({ children, onNewTicket }: PortalLayoutProps) {
  const workspace = useCurrentWorkspace();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  return (
    <DashboardGuard
      loadingFallback={
        <div className="flex h-svh items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      }
    >
      <div className="flex h-svh flex-col bg-background">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-border px-6 py-2.5">
          <div className="flex items-center gap-3">
            {workspace && (
              <>
                <WorkspaceAvatar name={workspace.name} size="sm" />
                <span className="text-sm font-medium text-foreground">{workspace.name}</span>
                <span className="text-muted-foreground">|</span>
                <span className="text-xs text-muted-foreground">Support Portal</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onNewTicket && (
              <Button size="sm" onClick={onNewTicket}>
                <Plus className="mr-1.5 size-3.5" />
                New Ticket
              </Button>
            )}
            <div className="mx-1 h-5 w-px bg-border" />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-foreground hover:bg-accent">
                    <ActorAvatar
                      name={user?.name ?? ""}
                      initials={(user?.name ?? "").split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)}
                      avatarUrl={user?.avatar_url ?? undefined}
                      size={20}
                    />
                    <span className="font-medium">{user?.name ?? user?.email}</span>
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                <div className="px-2 py-2 text-xs">
                  {user?.name && user.name !== user.email && (
                    <p className="font-medium text-foreground">{user.name}</p>
                  )}
                  <p className="text-muted-foreground">{user?.email}</p>
                </div>
                <DropdownMenuItem onClick={() => logout()}>
                  <LogOut className="mr-2 size-3.5" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </DashboardGuard>
  );
}
