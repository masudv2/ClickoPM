"use client";

import { useState } from "react";
import { Timer, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cycleListOptions } from "@multica/core/cycles/queries";
import { useWorkspaceId } from "@multica/core/hooks";
import type { UpdateIssueRequest, CycleStatus } from "@multica/core/types";
import { Button } from "@multica/ui/components/ui/button";
import { PropertyPicker, PickerItem } from "../../issues/components/pickers";

const ACTIVE_STATUSES: CycleStatus[] = ["active", "planned", "cooldown"];
const STATUS_LABELS: Record<string, string> = {
  active: "Current",
  planned: "Upcoming",
  cooldown: "Cooldown",
};

export function CycleBatchPicker({
  teamId,
  onUpdate,
  disabled,
}: {
  teamId: string;
  onUpdate: (updates: Partial<UpdateIssueRequest>) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wsId = useWorkspaceId();
  const { data: cycles = [] } = useQuery({
    ...cycleListOptions(wsId, teamId),
    enabled: !!teamId,
  });
  const activeCycles = cycles.filter((c) => ACTIVE_STATUSES.includes(c.status as CycleStatus));

  return (
    <PropertyPicker
      open={open}
      onOpenChange={setOpen}
      width="w-52"
      align="center"
      triggerRender={<Button variant="ghost" size="sm" disabled={disabled} />}
      trigger={
        <>
          <Timer className="size-3.5 mr-1" />
          Cycle
        </>
      }
    >
      {activeCycles.map((c) => (
        <PickerItem
          key={c.id}
          selected={false}
          onClick={() => {
            onUpdate({ cycle_id: c.id });
            setOpen(false);
          }}
        >
          <Timer className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="truncate flex-1">{c.name}</span>
          <span className="text-[10px] text-muted-foreground shrink-0">
            {STATUS_LABELS[c.status] || c.status}
          </span>
        </PickerItem>
      ))}
      <PickerItem
        selected={false}
        onClick={() => {
          onUpdate({ cycle_id: null });
          setOpen(false);
        }}
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
        Remove from cycle
      </PickerItem>
      {activeCycles.length === 0 && (
        <div className="px-2 py-1.5 text-xs text-muted-foreground">No active cycles</div>
      )}
    </PropertyPicker>
  );
}
