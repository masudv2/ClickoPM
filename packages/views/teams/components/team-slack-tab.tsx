"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { Switch } from "@multica/ui/components/ui/switch";
import { useUpdateTeam } from "@multica/core/teams";
import { useConfigStore } from "@multica/core/config";
import { api } from "@multica/core/api";
import type { Team } from "@multica/core/types";

const DAYS = [
  { value: "sunday", label: "Sunday" },
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
];

const TIME_OPTIONS = (() => {
  const times: { value: string; label: string }[] = [];
  for (let h = 6; h <= 22; h++) {
    for (const m of ["00", "30"]) {
      const v = `${String(h).padStart(2, "0")}:${m}`;
      const hour = h > 12 ? h - 12 : h === 0 ? 12 : h;
      const ampm = h >= 12 ? "PM" : "AM";
      times.push({ value: v, label: `${hour}:${m} ${ampm}` });
    }
  }
  return times;
})();

export function TeamSlackTab({ team }: { team: Team }) {
  const slackConfigured = useConfigStore((s) => s.slackConfigured);
  const updateTeam = useUpdateTeam();
  const reports = team.settings?.reports;

  const [enabled, setEnabled] = useState(reports?.enabled ?? false);
  const [channelId, setChannelId] = useState(reports?.slack_channel_id ?? "");
  const [channelName, setChannelName] = useState(reports?.slack_channel_name ?? "");
  const [morningTime, setMorningTime] = useState(reports?.morning_time ?? "09:00");
  const [eveningTime, setEveningTime] = useState(reports?.evening_time ?? "17:30");
  const [weeklyDay, setWeeklyDay] = useState(reports?.weekly_day ?? "sunday");
  const [weeklyTime, setWeeklyTime] = useState(reports?.weekly_time ?? "09:00");
  const [sprintDay, setSprintDay] = useState(reports?.sprint_day ?? "sunday");
  const [sprintTime, setSprintTime] = useState(reports?.sprint_time ?? "09:00");
  const [testSending, setTestSending] = useState<string | null>(null);

  useEffect(() => {
    const r = team.settings?.reports;
    setEnabled(r?.enabled ?? false);
    setChannelId(r?.slack_channel_id ?? "");
    setChannelName(r?.slack_channel_name ?? "");
    setMorningTime(r?.morning_time ?? "09:00");
    setEveningTime(r?.evening_time ?? "17:30");
    setWeeklyDay(r?.weekly_day ?? "sunday");
    setWeeklyTime(r?.weekly_time ?? "09:00");
    setSprintDay(r?.sprint_day ?? "sunday");
    setSprintTime(r?.sprint_time ?? "09:00");
  }, [team]);

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ["slack", "channels"],
    queryFn: () => api.listSlackChannels(),
    enabled: slackConfigured,
  });

  function save() {
    updateTeam.mutate(
      {
        id: team.id,
        settings: {
          ...team.settings,
          reports: {
            enabled,
            slack_channel_id: channelId || null,
            slack_channel_name: channelName || null,
            morning_time: morningTime,
            evening_time: eveningTime,
            weekly_day: weeklyDay,
            weekly_time: weeklyTime,
            sprint_day: sprintDay,
            sprint_time: sprintTime,
          },
        },
      },
      {
        onSuccess: () => toast.success("Report settings saved"),
        onError: () => toast.error("Failed to save"),
      },
    );
  }

  async function sendTest(reportType: "morning" | "evening" | "weekly" | "sprint") {
    if (!channelId) {
      toast.error("Select a channel first");
      return;
    }
    setTestSending(reportType);
    try {
      await api.sendTestReport(channelId, team.id, reportType);
      toast.success(`${reportType} report sent to #${channelName}`);
    } catch {
      toast.error(`Failed to send ${reportType} report`);
    } finally {
      setTestSending(null);
    }
  }

  if (!slackConfigured) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Slack Reports</h2>
          <p className="text-sm text-muted-foreground">Automated standup, recap, and weekly reports to Slack.</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-sm text-muted-foreground">
            Slack integration is not configured. Set the{" "}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SLACK_BOT_TOKEN</code> environment variable on
            the server to enable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Slack Reports</h2>
        <p className="text-sm text-muted-foreground">
          Automated standup, recap, and weekly reports delivered to a Slack channel.
        </p>
      </div>

      <div className="rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable reports</p>
            <p className="text-xs text-muted-foreground">Send automated reports to Slack on a schedule.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        {enabled && (
          <>
            <div className="border-t" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Channel</span>
              <select
                value={channelId}
                onChange={(e) => {
                  setChannelId(e.target.value);
                  const ch = channels.find((c) => c.id === e.target.value);
                  setChannelName(ch?.name ?? "");
                }}
                className="rounded-md border bg-background px-3 py-1.5 text-sm min-w-[200px]"
              >
                <option value="">{channelsLoading ? "Loading channels..." : "Select a channel"}</option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>
                    #{ch.name}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {enabled && channelId && (
        <div className="rounded-lg border p-4 space-y-4">
          <h3 className="text-sm font-semibold">Schedule</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Morning standup</p>
              <p className="text-xs text-muted-foreground">Today's priorities, blockers, in-progress work</p>
            </div>
            <select
              value={morningTime}
              onChange={(e) => setMorningTime(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="border-t" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Evening recap</p>
              <p className="text-xs text-muted-foreground">What got done, status changes, cycle progress</p>
            </div>
            <select
              value={eveningTime}
              onChange={(e) => setEveningTime(e.target.value)}
              className="rounded-md border bg-background px-3 py-1.5 text-sm"
            >
              {TIME_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="border-t" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Weekly report</p>
              <p className="text-xs text-muted-foreground">Week summary, velocity, cycle health, blockers</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={weeklyDay}
                onChange={(e) => setWeeklyDay(e.target.value)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                {DAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <select
                value={weeklyTime}
                onChange={(e) => setWeeklyTime(e.target.value)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="border-t" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Sprint planning</p>
              <p className="text-xs text-muted-foreground">Cycle status, per-member workload, backlog, blockers</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={sprintDay}
                onChange={(e) => setSprintDay(e.target.value)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                {DAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <select
                value={sprintTime}
                onChange={(e) => setSprintTime(e.target.value)}
                className="rounded-md border bg-background px-3 py-1.5 text-sm"
              >
                {TIME_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={updateTeam.isPending}>
          {updateTeam.isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>

      {enabled && channelId && (
        <div className="rounded-lg border p-4 space-y-3">
          <h3 className="text-sm font-semibold">Send test report</h3>
          <p className="text-xs text-muted-foreground">Send a real report to #{channelName} with current data.</p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => sendTest("morning")} disabled={testSending !== null}>
              <Send className="h-3 w-3 mr-1.5" />
              {testSending === "morning" ? "Sending..." : "Morning"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => sendTest("evening")} disabled={testSending !== null}>
              <Send className="h-3 w-3 mr-1.5" />
              {testSending === "evening" ? "Sending..." : "Evening"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => sendTest("weekly")} disabled={testSending !== null}>
              <Send className="h-3 w-3 mr-1.5" />
              {testSending === "weekly" ? "Sending..." : "Weekly"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => sendTest("sprint")} disabled={testSending !== null}>
              <Send className="h-3 w-3 mr-1.5" />
              {testSending === "sprint" ? "Sending..." : "Sprint"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
