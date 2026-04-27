"use client";

import type { Label } from "@multica/core/types";
import { LABEL_COLOR_CONFIG } from "@multica/core/labels";
import { X } from "lucide-react";

export function LabelPill({
  label,
  onRemove,
}: {
  label: Label;
  onRemove?: (id: string) => void;
}) {
  const cfg = LABEL_COLOR_CONFIG[label.color] ?? LABEL_COLOR_CONFIG.gray;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bg} ${cfg.text}`}
    >
      <span className={`size-1.5 rounded-full ${cfg.dot}`} />
      <span className="truncate max-w-[100px]">{label.name}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove(label.id);
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
        >
          <X className="size-2.5" />
        </button>
      )}
    </span>
  );
}
