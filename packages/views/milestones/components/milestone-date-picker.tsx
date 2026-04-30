"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { Calendar } from "@multica/ui/components/ui/calendar";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@multica/ui/components/ui/popover";
import { Button } from "@multica/ui/components/ui/button";

/** Date picker matching the issue DueDatePicker shape. Used by milestone form. */
export function MilestoneDatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  compact = false,
}: {
  value: string | null;
  onChange: (iso: string | null) => void;
  placeholder?: string;
  /** Compact mode renders an inline trigger (no Button wrap) — fits PropRow contexts. */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const date = value ? new Date(value) : undefined;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          compact ? (
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded px-1 -mx-1 cursor-pointer hover:bg-accent/30 transition-colors"
            >
              <CalendarDays className="size-3.5 text-muted-foreground" />
              {date ? (
                <span>{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </button>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2 font-normal"
            >
              <CalendarDays className="size-3.5 text-muted-foreground" />
              {date ? (
                <span>{date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              ) : (
                <span className="text-muted-foreground">{placeholder}</span>
              )}
            </Button>
          )
        }
      />
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={(d: Date | undefined) => {
            if (!d) {
              onChange(null);
            } else {
              const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
              onChange(iso);
            }
            setOpen(false);
          }}
        />
        {date && (
          <div className="border-t px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-xs text-muted-foreground"
              onClick={() => { onChange(null); setOpen(false); }}
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
