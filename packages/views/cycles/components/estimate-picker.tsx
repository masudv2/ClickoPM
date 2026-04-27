"use client";

import { Check, Hash, X } from "lucide-react";
import type { UpdateIssueRequest } from "@multica/core/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@multica/ui/components/ui/dropdown-menu";

const FIBONACCI = [0, 1, 2, 3, 5, 8, 13, 21];

export function EstimatePicker({
  estimate,
  onUpdate,
  align = "start",
}: {
  estimate: number | null;
  onUpdate: (updates: Partial<UpdateIssueRequest>) => void;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 cursor-pointer rounded px-1 -mx-1 hover:bg-accent/30 transition-colors overflow-hidden">
        <Hash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{estimate != null ? `${estimate} pts` : "No estimate"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-36">
        {FIBONACCI.map((v) => (
          <DropdownMenuItem key={v} onClick={() => onUpdate({ estimate: v })}>
            <span className="tabular-nums">{v}</span>
            <span className="text-xs text-muted-foreground ml-1">pts</span>
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
