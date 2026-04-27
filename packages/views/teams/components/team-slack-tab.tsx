"use client";

import { Switch } from "@multica/ui/components/ui/switch";
import type { Team } from "@multica/core/types";

const NOTIFICATION_TYPES = [
  "New project update is posted",
  "An issue is added to the team",
  "An issue is marked completed or canceled",
  "An issue changes status",
  "Comments to issues",
  "An issue is added to the triage queue",
];

export function TeamSlackTab({ team: _team }: { team: Team }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Slack notifications</h2>
        <p className="text-sm text-muted-foreground">Connect a Slack channel to receive notifications about this team.</p>
      </div>

      <div className="rounded-lg border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Connect a Slack channel</p>
            <p className="text-xs text-muted-foreground">Connect a channel to broadcast notifications from this team.</p>
          </div>
          <span className="text-sm text-muted-foreground cursor-not-allowed">Coming soon</span>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold mb-3">Notifications</h3>
        <div className="rounded-lg border p-4 space-y-4 opacity-50">
          {NOTIFICATION_TYPES.map((label, i) => (
            <div key={label}>
              {i > 0 && <div className="border-t mb-4" />}
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{label}</span>
                <Switch disabled />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
