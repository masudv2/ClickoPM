# Daily Reports — Slack Team Reports

## Goal

Automated template-based reports delivered to per-team Slack channels: morning standup, evening recap, and weekly summary. No AI — pure data-driven templates.

## Architecture

A Go background goroutine (same pattern as cycle sweeper) checks every 5 minutes whether any team has a report due. When due, it queries issue/activity data, formats it into Slack Block Kit messages, and posts via `chat.postMessage`. Each team configures its own Slack channel and report schedule in team settings.

## Config Storage

No new tables. Report config lives in the existing `team.settings` JSONB field:

```json
{
  "reports": {
    "enabled": true,
    "slack_channel_id": "C07XXXXXX",
    "slack_channel_name": "#ops-standup",
    "morning_time": "09:00",
    "evening_time": "17:30",
    "weekly_day": "sunday",
    "weekly_time": "09:00"
  }
}
```

The `SLACK_BOT_TOKEN` env var is set on the server (one bot installation per workspace). Required scopes: `chat:write`, `channels:read`.

## New API Endpoints

### `GET /api/slack/channels`

Lists Slack channels the bot can see. Calls Slack `conversations.list` API, returns `[{ id, name }]`. Used by the team settings dropdown.

## New SQL Queries

### `GetTeamDailySummary`

Returns issues in a team that changed status today, grouped by assignee. Fields: issue title, assignee name, old status, new status, action (created/completed/started). Queried from `activity_log` joined with `issue` table, filtered by `created_at >= today` in team timezone.

### `GetTeamBlockers`

Returns issues in a team with `status = 'blocked'`. Fields: issue title, assignee name, days blocked (from last status change).

### `GetTeamWeeklySummary`

Same as daily but filtered by `created_at >= 7 days ago`. Also includes cycle progress delta: scope count change, completed count change over the week.

## Report Scheduler

**File:** `server/cmd/server/report_scheduler.go`

- Runs as a goroutine started from `main.go`
- Uses `time.Ticker` with 5-minute interval
- On each tick: loads all teams with `reports.enabled = true`, checks current time in team's timezone against configured times (with 5-minute matching window)
- Tracks last-sent timestamps in memory (`map[teamID+reportType]time.Time`) to prevent double-sends
- On match: queries data, formats Slack blocks, posts to channel

## Slack Service

**File:** `server/internal/service/slack.go`

Thin HTTP client (no external library):
- `ListChannels(token string) ([]SlackChannel, error)` — GET `conversations.list`
- `PostMessage(token, channelID string, blocks []Block) error` — POST `chat.postMessage`
- Block Kit builder functions for each report type

## Report Templates

### Morning Standup (default 9:00 AM)

```
Header: "Morning Standup — {team.name}"
Context: "{day_of_week}, {date} · {cycle.name} · {completed}/{scope} done ({percent}%)"

Section: "Blockers ({count})" — if any
  • {issue.title} — @{assignee_name} ({days} days)

Section: "In Progress ({count})"
  Grouped by assignee:
    @{assignee_name} ({count})
      • {issue.title}

Section: "To Do ({count})"
  • {count} issues waiting
```

### Evening Recap (default 5:30 PM)

```
Header: "End of Day — {team.name}"
Context: "{day_of_week}, {date}"

Section: "Completed Today ({count})"
  • {issue.title} — @{assignee_name}

Section: "Status Changes ({count})"
  • {issue.title} → {new_status}

Section: "New Issues ({count})"
  • {issue.title} — @{assignee_name_or_unassigned}

Section: "Cycle Progress"
  {cycle.name}: {old_percent}% → {new_percent}% (+{delta} done today)
```

### Weekly Report (default Sunday 9:00 AM)

```
Header: "Weekly Report — {team.name} · {date_range}"

Section: "Completed ({count})"
  By assignee:
    @{assignee_name}: {count} completed

Section: "Scope Changes"
  {cycle.name}: +{added} added, {removed} removed

Section: "Cycle Health"
  {cycle.name}
  {remaining} remaining · ends {end_date} · {capacity}% capacity
  {status_emoji} {status_text}

Section: "Blockers ({count})" — if any
  • {issue.title} ({days} days old) — @{assignee_name}
```

## Frontend — Team Slack Tab

**File:** `packages/views/teams/components/team-slack-tab.tsx` (replace existing placeholder)

Replaces the "Coming soon" placeholder with:

1. **Channel selector** — dropdown populated from `GET /api/slack/channels`. Shows `#channel-name`, stores channel ID in team settings.
2. **Report toggle** — enable/disable all reports for this team.
3. **Schedule config** — three rows:
   - Morning standup: time picker (default 09:00)
   - Evening recap: time picker (default 17:30)
   - Weekly report: day picker (Sun-Sat) + time picker (default Sun 09:00)
4. **Test button** — sends a sample morning report to the selected channel immediately (useful for verifying the channel works).

The section only renders interactively when `SLACK_BOT_TOKEN` is configured. The frontend checks this via a `slack_configured: boolean` flag added to the workspace config response.

## Files to Create/Modify

### New Files
1. `server/internal/service/slack.go` — Slack API client (ListChannels, PostMessage)
2. `server/cmd/server/report_scheduler.go` — background scheduler goroutine
3. `server/cmd/server/report_formatter.go` — Slack Block Kit formatters for each report type

### Modified Files
4. `server/pkg/db/queries/issue.sql` — add GetTeamDailySummary, GetTeamBlockers, GetTeamWeeklySummary queries
5. `server/pkg/db/generated/issue.sql.go` — sqlc regen
6. `server/internal/handler/slack.go` — new handler for GET /api/slack/channels
7. `server/cmd/server/router.go` — register /api/slack/channels route
8. `server/cmd/server/main.go` — start report scheduler goroutine, init Slack service
9. `packages/core/api/client.ts` — add `listSlackChannels()` method
10. `packages/core/types/team.ts` — add `ReportSettings` type
11. `packages/views/teams/components/team-slack-tab.tsx` — replace placeholder with real UI
12. `server/internal/handler/workspace.go` — add `slack_configured` flag to workspace config response

## Error Handling

- Slack API failures are logged but don't crash the scheduler. The report is skipped and will not retry (next scheduled time will work).
- Invalid/expired bot token: log error once, skip all reports until token is refreshed.
- Channel not found (deleted): log warning, skip that team's report.
- No activity data for the period: still send the report with "No activity today" message rather than skipping silently.
