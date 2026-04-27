"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Input } from "@multica/ui/components/ui/input";
import { Button } from "@multica/ui/components/ui/button";
import { useUpdateTeam, useDeleteTeam } from "@multica/core/teams";
import { LABEL_COLORS, LABEL_COLOR_CONFIG } from "@multica/core/labels";
import type { Team, LabelColor } from "@multica/core/types";
import { useNavigation } from "../../navigation";
import { useWorkspacePaths } from "@multica/core/paths";

const ESTIMATE_SCALES = [
  { value: "not_in_use", label: "Not in use" },
  { value: "fibonacci", label: "Fibonacci (0, 1, 2, 3, 5, 8, 13, 21)" },
  { value: "linear", label: "Linear (1-10)" },
  { value: "tshirt", label: "T-shirt (XS, S, M, L, XL, XXL)" },
];

export function TeamGeneralTab({ team }: { team: Team }) {
  const updateTeam = useUpdateTeam();
  const deleteTeam = useDeleteTeam();
  const nav = useNavigation();
  const p = useWorkspacePaths();

  const [name, setName] = useState(team.name);
  const [identifier, setIdentifier] = useState(team.identifier);
  const [icon, setIcon] = useState(team.icon || "");
  const [color, setColor] = useState<LabelColor>(team.color as LabelColor);
  const [timezone, setTimezone] = useState(team.timezone);
  const [estimateScale, setEstimateScale] = useState(
    team.settings?.estimates?.scale || "not_in_use"
  );

  useEffect(() => {
    setName(team.name);
    setIdentifier(team.identifier);
    setIcon(team.icon || "");
    setColor(team.color as LabelColor);
    setTimezone(team.timezone);
    setEstimateScale(team.settings?.estimates?.scale || "not_in_use");
  }, [team]);

  function save() {
    updateTeam.mutate({
      id: team.id,
      name,
      identifier,
      icon: icon || undefined,
      color,
      timezone,
      settings: {
        ...team.settings,
        estimates: {
          enabled: estimateScale !== "not_in_use",
          scale: estimateScale as "fibonacci" | "linear" | "tshirt" | "not_in_use",
        },
      },
    }, {
      onSuccess: () => toast.success("Team updated"),
      onError: () => toast.error("Failed to update team"),
    });
  }

  return (
    <div className="space-y-8">
      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium w-32">Icon & Name</span>
          <div className="flex items-center gap-2 flex-1">
            <div className="flex flex-wrap gap-2">
              {LABEL_COLORS.map((c) => {
                const cfg = LABEL_COLOR_CONFIG[c];
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`size-5 rounded-full ${cfg.dot} ${c === color ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                  />
                );
              })}
            </div>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium w-32">Identifier</span>
          <Input value={identifier} onChange={(e) => setIdentifier(e.target.value.toUpperCase())} className="max-w-xs" />
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold mb-1">Timezone</h3>
        <p className="text-sm text-muted-foreground mb-3">Cycle start times use this timezone.</p>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium flex-1">Timezone</span>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {Intl.supportedValuesOf("timeZone").map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-base font-semibold mb-1">Estimates</h3>
        <p className="text-sm text-muted-foreground mb-3">Choose how your team estimates issue complexity.</p>
        <div className="rounded-lg border p-4">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium flex-1">Issue estimation</span>
            <select
              value={estimateScale}
              onChange={(e) => setEstimateScale(e.target.value as typeof estimateScale)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {ESTIMATE_SCALES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <Button onClick={save} disabled={updateTeam.isPending}>
        {updateTeam.isPending ? "Saving..." : "Save changes"}
      </Button>

      <div className="rounded-lg border border-destructive/30 p-4">
        <h3 className="text-base font-semibold text-destructive mb-2">Delete team</h3>
        <p className="text-sm text-muted-foreground mb-3">This will permanently delete this team and all its issues.</p>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => {
            if (confirm(`Delete team "${team.name}"? This cannot be undone.`)) {
              deleteTeam.mutate(team.id, {
                onSuccess: () => { toast.success("Team deleted"); nav.push(p.settings()); },
                onError: () => toast.error("Failed to delete team"),
              });
            }
          }}
        >
          Delete team
        </Button>
      </div>
    </div>
  );
}
