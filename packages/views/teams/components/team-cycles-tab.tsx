"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@multica/ui/components/ui/button";
import { Switch } from "@multica/ui/components/ui/switch";
import { useUpdateTeam } from "@multica/core/teams";
import type { Team } from "@multica/core/types";

const DURATION_OPTIONS = [
  { value: 1, label: "1 week" }, { value: 2, label: "2 weeks" },
  { value: 3, label: "3 weeks" }, { value: 4, label: "4 weeks" },
  { value: 6, label: "6 weeks" },
];

const COOLDOWN_OPTIONS = [
  { value: 0, label: "None" }, { value: 1, label: "1 week" }, { value: 2, label: "2 weeks" },
];

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

const AUTO_CREATE_OPTIONS = [
  { value: 0, label: "None" }, { value: 1, label: "1 cycle" },
  { value: 2, label: "2 cycles" }, { value: 3, label: "3 cycles" }, { value: 4, label: "4 cycles" },
];

export function TeamCyclesTab({ team }: { team: Team }) {
  const updateTeam = useUpdateTeam();
  const cycles = team.settings?.cycles;

  const [enabled, setEnabled] = useState(cycles?.enabled ?? false);
  const [duration, setDuration] = useState(cycles?.duration_weeks ?? 2);
  const [cooldown, setCooldown] = useState(cycles?.cooldown_weeks ?? 0);
  const [startDay, setStartDay] = useState(cycles?.start_day ?? "monday");
  const [autoCreate, setAutoCreate] = useState(cycles?.auto_create_count ?? 2);
  const [autoAddStarted, setAutoAddStarted] = useState(cycles?.auto_add_started ?? true);
  const [autoAddCompleted, setAutoAddCompleted] = useState(cycles?.auto_add_completed ?? true);

  useEffect(() => {
    const c = team.settings?.cycles;
    setEnabled(c?.enabled ?? false);
    setDuration(c?.duration_weeks ?? 2);
    setCooldown(c?.cooldown_weeks ?? 0);
    setStartDay(c?.start_day ?? "monday");
    setAutoCreate(c?.auto_create_count ?? 2);
    setAutoAddStarted(c?.auto_add_started ?? true);
    setAutoAddCompleted(c?.auto_add_completed ?? true);
  }, [team]);

  function save() {
    updateTeam.mutate({
      id: team.id,
      settings: {
        ...team.settings,
        cycles: { enabled, duration_weeks: duration, cooldown_weeks: cooldown, start_day: startDay, auto_create_count: autoCreate, auto_add_started: autoAddStarted, auto_add_completed: autoAddCompleted },
      },
    }, {
      onSuccess: () => toast.success("Cycle settings saved"),
      onError: () => toast.error("Failed to save"),
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Cycles</h2>
        <p className="text-sm text-muted-foreground">Time-boxed planning windows for focused work.</p>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable cycles</p>
            <p className="text-xs text-muted-foreground">For velocity metrics, enable estimates in team settings.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>

      {enabled && (
        <>
          <div className="rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Cycle duration</span>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="rounded-md border bg-background px-3 py-1.5 text-sm">
                {DURATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="border-t" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Cooldown duration</span>
              <select value={cooldown} onChange={(e) => setCooldown(Number(e.target.value))} className="rounded-md border bg-background px-3 py-1.5 text-sm">
                {COOLDOWN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="border-t" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Cycle start</span>
              <select value={startDay} onChange={(e) => setStartDay(e.target.value)} className="rounded-md border bg-background px-3 py-1.5 text-sm capitalize">
                {DAYS.map((d) => <option key={d} value={d} className="capitalize">{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
              </select>
            </div>
            <div className="border-t" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Auto-create cycles</span>
              <select value={autoCreate} onChange={(e) => setAutoCreate(Number(e.target.value))} className="rounded-md border bg-background px-3 py-1.5 text-sm">
                {AUTO_CREATE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-1">Cycle automation</h3>
            <p className="text-xs text-muted-foreground mb-3">Auto-add issues to cycles based on status.</p>
            <div className="rounded-lg border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Active issues & due date</p>
                  <p className="text-xs text-muted-foreground">Auto-add started, unstarted, and issues with matching due dates.</p>
                </div>
                <Switch checked={autoAddStarted} onCheckedChange={setAutoAddStarted} />
              </div>
              <div className="border-t" />
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Completed issues</p>
                  <p className="text-xs text-muted-foreground">Auto-add completed issues to the current cycle.</p>
                </div>
                <Switch checked={autoAddCompleted} onCheckedChange={setAutoAddCompleted} />
              </div>
            </div>
          </div>
        </>
      )}

      <Button onClick={save} disabled={updateTeam.isPending}>
        {updateTeam.isPending ? "Saving..." : "Save changes"}
      </Button>
    </div>
  );
}
