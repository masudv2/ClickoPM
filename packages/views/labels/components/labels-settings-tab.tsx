"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { useWorkspaceId } from "@multica/core/hooks";
import { labelListOptions, LABEL_COLORS, LABEL_COLOR_CONFIG } from "@multica/core/labels";
import { useCreateLabel, useUpdateLabel, useDeleteLabel } from "@multica/core/labels";
import type { LabelColor } from "@multica/core/types";

function ColorDot({ color, selected, onClick }: { color: LabelColor; selected: boolean; onClick: () => void }) {
  const cfg = LABEL_COLOR_CONFIG[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`size-5 rounded-full ${cfg.dot} ${selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "hover:ring-1 hover:ring-muted-foreground"}`}
    />
  );
}

function LabelForm({
  initialName = "",
  initialColor = "blue" as LabelColor,
  onSave,
  onCancel,
  saving,
}: {
  initialName?: string;
  initialColor?: LabelColor;
  onSave: (name: string, color: LabelColor) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState<LabelColor>(initialColor);

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <Input
        placeholder="Label name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div className="flex flex-wrap gap-2">
        {LABEL_COLORS.map((c) => (
          <ColorDot key={c} color={c} selected={c === color} onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={!name.trim() || saving} onClick={() => onSave(name.trim(), color)}>
          {saving ? "Saving..." : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

export function LabelsSettingsTab() {
  const wsId = useWorkspaceId();
  const { data: labels = [] } = useQuery(labelListOptions(wsId));
  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();
  const deleteLabel = useDeleteLabel();

  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Labels</h2>
          <p className="text-sm text-muted-foreground">Manage workspace labels for organizing issues.</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)} disabled={showCreate}>
          <Plus className="size-4 mr-1" /> New label
        </Button>
      </div>

      {showCreate && (
        <div className="mb-4">
          <LabelForm
            saving={createLabel.isPending}
            onSave={(name, color) => {
              createLabel.mutate({ name, color }, {
                onSuccess: () => { setShowCreate(false); toast.success("Label created"); },
                onError: () => toast.error("Failed to create label"),
              });
            }}
            onCancel={() => setShowCreate(false)}
          />
        </div>
      )}

      <div className="space-y-1">
        {labels.map((label) => {
          const cfg = LABEL_COLOR_CONFIG[label.color] ?? LABEL_COLOR_CONFIG.gray;
          if (editingId === label.id) {
            return (
              <LabelForm
                key={label.id}
                initialName={label.name}
                initialColor={label.color}
                saving={updateLabel.isPending}
                onSave={(name, color) => {
                  updateLabel.mutate({ id: label.id, name, color }, {
                    onSuccess: () => { setEditingId(null); toast.success("Label updated"); },
                    onError: () => toast.error("Failed to update label"),
                  });
                }}
                onCancel={() => setEditingId(null)}
              />
            );
          }
          return (
            <div
              key={label.id}
              className="flex items-center gap-3 rounded-lg border px-4 py-2.5 group hover:bg-accent/50 transition-colors"
            >
              <span className={`size-3 rounded-full ${cfg.dot}`} />
              <span className="flex-1 text-sm font-medium">{label.name}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="size-7" onClick={() => setEditingId(label.id)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-destructive hover:text-destructive"
                  onClick={() => {
                    deleteLabel.mutate(label.id, {
                      onSuccess: () => toast.success("Label deleted"),
                      onError: () => toast.error("Failed to delete label"),
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
        {labels.length === 0 && !showCreate && (
          <p className="text-sm text-muted-foreground py-8 text-center">No labels yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}
