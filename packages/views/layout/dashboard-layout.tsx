"use client";

import { type ReactNode, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { SidebarProvider, SidebarInset } from "@multica/ui/components/ui/sidebar";
import { useAuthStore } from "@multica/core/auth";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { memberListOptions } from "@multica/core/workspace";
import { ModalRegistry } from "../modals/registry";
import { useNavigation } from "../navigation";
import { AppSidebar } from "./app-sidebar";
import { DashboardGuard } from "./dashboard-guard";

interface DashboardLayoutProps {
  children: ReactNode;
  /** Rendered inside SidebarInset — absolute-positioned overlays */
  extra?: ReactNode;
  /** Rendered inside sidebar header as a search trigger */
  searchSlot?: ReactNode;
  /** Loading indicator */
  loadingIndicator?: ReactNode;
}

function ClientRoleGuard({
  children,
  loadingFallback,
}: {
  children: ReactNode;
  loadingFallback?: ReactNode;
}) {
  const wsId = useWorkspaceId();
  const userId = useAuthStore((s) => s.user?.id);
  const { data: members, isLoading } = useQuery(memberListOptions(wsId));
  const { replace } = useNavigation();
  const p = useWorkspacePaths();

  const me = members?.find((m) => m.user_id === userId);
  const isClient = me?.role === "client";

  useEffect(() => {
    if (isClient) {
      replace(p.portal());
    }
  }, [isClient, replace, p]);

  if (isLoading || !members) return <>{loadingFallback}</>;
  if (isClient) return <>{loadingFallback}</>;

  return <>{children}</>;
}

export function DashboardLayout({
  children,
  extra,
  searchSlot,
  loadingIndicator,
}: DashboardLayoutProps) {
  const fallback = (
    <div className="flex h-svh items-center justify-center">
      {loadingIndicator}
    </div>
  );

  return (
    <DashboardGuard loadingFallback={fallback}>
      <ClientRoleGuard loadingFallback={fallback}>
        <SidebarProvider className="h-svh">
          <AppSidebar searchSlot={searchSlot} />
          <SidebarInset className="relative overflow-hidden">
            {children}
            <ModalRegistry />
            {extra}
          </SidebarInset>
        </SidebarProvider>
      </ClientRoleGuard>
    </DashboardGuard>
  );
}
