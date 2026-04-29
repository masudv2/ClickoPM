"use client";

import { Check, Hash, X } from "lucide-react";
import type { UpdateIssueRequest } from "@multica/core/types";
import { ESTIMATE_SCALES, type EstimateScale } from "@multica/core/issues/config";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@multica/ui/components/ui/dropdown-menu";

export function EstimatePicker({
  estimate,
  onUpdate,
  scale = "fibonacci",
  align = "start",
}: {
  estimate: number | null;
  onUpdate: (updates: Partial<UpdateIssueRequest>) => void;
  scale?: EstimateScale;
  align?: "start" | "center" | "end";
}) {
  const cfg = ESTIMATE_SCALES[scale];
  const displayLabel = estimate != null
    ? (cfg.labels[estimate] ?? String(estimate)) + (cfg.unit ? ` ${cfg.unit}` : "")
    : "No estimate";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 cursor-pointer rounded px-1 -mx-1 hover:bg-accent/30 transition-colors overflow-hidden">
        <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{displayLabel}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-36">
        {cfg.values.map((v) => (
          <DropdownMenuItem key={v} onClick={() => onUpdate({ estimate: v })}>
            <span className="tabular-nums">{cfg.labels[v] ?? v}</span>
            {cfg.unit && <span className="text-xs text-muted-foreground ml-1">{cfg.unit}</span>}
            {v === estimate && <Check className="ml-auto h-3.5 w-3.5 shrink-0" />}
          </DropdownMenuItem>
        ))}
        {estimate != null && <DropdownMenuSeparator />}
        {estimate != null && (
          <DropdownMenuItem onClick={() => onUpdate({ estimate: null })}>
            <X className="h-3.5 w-3.5 text-muted-foreground" />
            Remove estimate
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
