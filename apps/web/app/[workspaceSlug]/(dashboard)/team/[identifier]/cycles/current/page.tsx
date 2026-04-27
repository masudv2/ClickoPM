"use client";

import { use, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { teamListOptions } from "@multica/core/teams";
import { cycleListOptions } from "@multica/core/cycles/queries";
import { useNavigation } from "@multica/views/navigation";

export default function CurrentCyclePage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = use(params);
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const nav = useNavigation();

  const { data: teams = [] } = useQuery(teamListOptions(wsId));
  const team = teams.find((t) => t.identifier.toLowerCase() === identifier.toLowerCase());
  const teamId = team?.id ?? "";

  const { data: cycles = [] } = useQuery(cycleListOptions(wsId, teamId));
  const activeCycle = cycles.find((c) => c.status === "active");

  useEffect(() => {
    if (activeCycle) {
      nav.replace(p.teamCycleDetail(identifier, activeCycle.id));
    } else if (cycles.length > 0 && !cycles.some((c) => c.status === "active")) {
      nav.replace(p.teamCycles(identifier));
    }
  }, [activeCycle, cycles, identifier, nav, p]);

  return (
    <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
      Loading...
    </div>
  );
}
