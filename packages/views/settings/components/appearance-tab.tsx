"use client";

import { cn } from "@multica/ui/lib/utils";

const DARK_COLORS = {
  titleBar: "#333338",
  content: "#27272a",
  sidebar: "#1e1e21",
  bar: "#3f3f46",
  barMuted: "#52525b",
};

function WindowMockup({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-full w-full flex-col", className)}>
      <div
        className="flex items-center gap-[3px] px-2 py-1.5"
        style={{ backgroundColor: DARK_COLORS.titleBar }}
      >
        <span className="size-[6px] rounded-full bg-[#ff5f57]" />
        <span className="size-[6px] rounded-full bg-[#febc2e]" />
        <span className="size-[6px] rounded-full bg-[#28c840]" />
      </div>
      <div
        className="flex flex-1"
        style={{ backgroundColor: DARK_COLORS.content }}
      >
        <div
          className="w-[30%] space-y-1 p-2"
          style={{ backgroundColor: DARK_COLORS.sidebar }}
        >
          <div className="h-1 w-3/4 rounded-full" style={{ backgroundColor: DARK_COLORS.bar }} />
          <div className="h-1 w-1/2 rounded-full" style={{ backgroundColor: DARK_COLORS.bar }} />
        </div>
        <div className="flex-1 space-y-1.5 p-2">
          <div className="h-1.5 w-4/5 rounded-full" style={{ backgroundColor: DARK_COLORS.bar }} />
          <div className="h-1 w-full rounded-full" style={{ backgroundColor: DARK_COLORS.barMuted }} />
          <div className="h-1 w-3/5 rounded-full" style={{ backgroundColor: DARK_COLORS.barMuted }} />
        </div>
      </div>
    </div>
  );
}

export function AppearanceTab() {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <h2 className="text-sm font-semibold">Theme</h2>
        <div className="flex gap-6" role="radiogroup" aria-label="Theme">
          <div className="flex flex-col items-center gap-2">
            <div className="aspect-[4/3] w-36 overflow-hidden rounded-lg ring-2 ring-brand">
              <WindowMockup />
            </div>
            <span className="text-sm font-medium text-foreground">Dark</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Dark mode is always active.</p>
      </section>
    </div>
  );
}
