"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Tag, Check } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@multica/ui/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@multica/ui/components/ui/command";
import { useWorkspaceId } from "@multica/core/hooks";
import { labelListOptions, LABEL_COLOR_CONFIG } from "@multica/core/labels";
import { useSetIssueLabels } from "@multica/core/labels";
import type { Label } from "@multica/core/types";
import { LabelPill } from "./label-pill";

export function LabelPicker({
  issueId,
  labels = [],
}: {
  issueId: string;
  labels?: Label[];
}) {
  const [open, setOpen] = useState(false);
  const wsId = useWorkspaceId();
  const { data: allLabels = [] } = useQuery(labelListOptions(wsId));
  const setLabels = useSetIssueLabels();

  const selectedIds = new Set(labels.map((l) => l.id));

  function toggle(labelId: string) {
    const next = selectedIds.has(labelId)
      ? labels.filter((l) => l.id !== labelId).map((l) => l.id)
      : [...labels.map((l) => l.id), labelId];
    setLabels.mutate({ issueId, labelIds: next });
  }

  function remove(labelId: string) {
    const next = labels.filter((l) => l.id !== labelId).map((l) => l.id);
    setLabels.mutate({ issueId, labelIds: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {labels.map((l) => (
        <LabelPill key={l.id} label={l} onRemove={remove} />
      ))}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent transition-colors"
        >
          <Tag className="size-3" />
          {labels.length === 0 && "Add label"}
        </PopoverTrigger>
        <PopoverContent className="w-52 p-0" align="start">
          <Command>
            <CommandInput placeholder="Search labels..." />
            <CommandList>
              <CommandEmpty>No labels found</CommandEmpty>
              <CommandGroup>
                {allLabels.map((label) => {
                  const cfg = LABEL_COLOR_CONFIG[label.color] ?? LABEL_COLOR_CONFIG.gray;
                  const isSelected = selectedIds.has(label.id);
                  return (
                    <CommandItem
                      key={label.id}
                      value={label.name}
                      onSelect={() => toggle(label.id)}
                    >
                      <span className={`size-2 rounded-full ${cfg.dot}`} />
                      <span className="flex-1 truncate">{label.name}</span>
                      {isSelected && <Check className="size-3.5 text-primary" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
