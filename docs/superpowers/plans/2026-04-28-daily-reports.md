# Daily Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automated template-based Slack reports (morning standup, evening recap, weekly summary) delivered to per-team channels on configurable schedules.

**Architecture:** A Go background goroutine checks every 5 minutes if any team's report is due based on team timezone and configured times. When due, it queries issue/activity data, formats Slack Block Kit messages, and posts via `chat.postMessage`. Per-team config (channel, schedule) stored in existing `team.settings` JSONB.

**Tech Stack:** Go stdlib (HTTP client, time, JSON), Slack Web API (chat.postMessage, conversations.list), React (team settings UI)

---

## File Structure

| File | Responsibility |
|---|---|
| `server/internal/service/slack.go` | Slack API client — ListChannels, PostMessage |
| `server/cmd/server/report_scheduler.go` | Background goroutine — check schedules, dispatch reports |
| `server/cmd/server/report_formatter.go` | Build Slack Block Kit payloads for each report type |
| `server/pkg/db/queries/report.sql` | SQL queries for report data (daily/weekly summaries) |
| `server/internal/handler/slack.go` | HTTP handler for GET /api/slack/channels |
| `packages/core/types/team.ts` | Add ReportSettings to TeamSettings |
| `packages/core/api/client.ts` | Add listSlackChannels() method |
| `packages/core/config/index.ts` | Add slackConfigured flag |
| `packages/views/teams/components/team-slack-tab.tsx` | Replace placeholder with real UI |
| `server/internal/handler/config.go` | Add slack_configured to AppConfig |
| `server/cmd/server/router.go` | Register /api/slack/channels route |
| `server/cmd/server/main.go` | Start report scheduler goroutine |

---

### Task 1: Slack API Client

**Files:**
- Create: `server/internal/service/slack.go`

- [ ] **Step 1: Create the Slack service file**

```go
// server/internal/service/slack.go
package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
)

type SlackChannel struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type SlackService struct {
	token      string
	httpClient *http.Client
}

func NewSlackService(token string) *SlackService {
	return &SlackService{
		token:      token,
		httpClient: &http.Client{},
	}
}

func (s *SlackService) IsConfigured() bool {
	return s.token != ""
}

// ListChannels returns public channels the bot can see.
func (s *SlackService) ListChannels() ([]SlackChannel, error) {
	var allChannels []SlackChannel
	cursor := ""

	for {
		params := url.Values{}
		params.Set("types", "public_channel")
		params.Set("exclude_archived", "true")
		params.Set("limit", "200")
		if cursor != "" {
			params.Set("cursor", cursor)
		}

		req, err := http.NewRequest("GET", "https://slack.com/api/conversations.list?"+params.Encode(), nil)
		if err != nil {
			return nil, fmt.Errorf("slack: build request: %w", err)
		}
		req.Header.Set("Authorization", "Bearer "+s.token)

		resp, err := s.httpClient.Do(req)
		if err != nil {
			return nil, fmt.Errorf("slack: request failed: %w", err)
		}
		defer resp.Body.Close()

		body, _ := io.ReadAll(resp.Body)
		var result struct {
			OK       bool `json:"ok"`
			Channels []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"channels"`
			ResponseMetadata struct {
				NextCursor string `json:"next_cursor"`
			} `json:"response_metadata"`
			Error string `json:"error"`
		}
		if err := json.Unmarshal(body, &result); err != nil {
			return nil, fmt.Errorf("slack: decode response: %w", err)
		}
		if !result.OK {
			return nil, fmt.Errorf("slack: API error: %s", result.Error)
		}

		for _, ch := range result.Channels {
			allChannels = append(allChannels, SlackChannel{ID: ch.ID, Name: ch.Name})
		}

		if result.ResponseMetadata.NextCursor == "" {
			break
		}
		cursor = result.ResponseMetadata.NextCursor
	}

	return allChannels, nil
}

// SlackBlock represents a Slack Block Kit block.
type SlackBlock map[string]any

// PostMessage sends a Block Kit message to a Slack channel.
func (s *SlackService) PostMessage(channelID string, blocks []SlackBlock) error {
	payload := map[string]any{
		"channel": channelID,
		"blocks":  blocks,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("slack: marshal payload: %w", err)
	}

	req, err := http.NewRequest("POST", "https://slack.com/api/chat.postMessage", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("slack: build request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("Content-Type", "application/json; charset=utf-8")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("slack: request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return fmt.Errorf("slack: decode response: %w", err)
	}
	if !result.OK {
		return fmt.Errorf("slack: post failed: %s", result.Error)
	}

	slog.Info("slack: message posted", "channel", channelID)
	return nil
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd server && go build ./...`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add server/internal/service/slack.go
git commit -m "feat(reports): add Slack API client service"
```

---

### Task 2: Report Data SQL Queries

**Files:**
- Create: `server/pkg/db/queries/report.sql`
- Regenerate: `server/pkg/db/generated/report.sql.go`

- [ ] **Step 1: Create the report queries file**

```sql
-- server/pkg/db/queries/report.sql

-- name: GetTeamDailySummary :many
-- Returns issues that had status changes today for a given team.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    i.status AS current_status,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name,
    a.action,
    a.details,
    a.created_at
FROM activity_log a
JOIN issue i ON i.id = a.issue_id
WHERE a.workspace_id = $1
  AND i.team_id = $2
  AND a.action IN ('status_changed', 'created')
  AND a.created_at >= $3
  AND a.created_at < $4
ORDER BY a.created_at DESC;

-- name: GetTeamBlockers :many
-- Returns blocked issues for a team with days-blocked calculation.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name,
    EXTRACT(DAY FROM now() - COALESCE(
        (SELECT al.created_at FROM activity_log al WHERE al.issue_id = i.id AND al.action = 'status_changed' ORDER BY al.created_at DESC LIMIT 1),
        i.created_at
    ))::integer AS days_blocked
FROM issue i
WHERE i.team_id = $1
  AND i.status = 'blocked'
ORDER BY days_blocked DESC;

-- name: GetTeamInProgressIssues :many
-- Returns in-progress issues for a team grouped by assignee.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name
FROM issue i
WHERE i.team_id = $1
  AND i.status = 'in_progress'
ORDER BY assignee_name, i.created_at;

-- name: GetTeamTodoCount :one
-- Returns count of todo issues for a team.
SELECT COUNT(*) AS count
FROM issue
WHERE team_id = $1
  AND status = 'todo';

-- name: GetTeamCompletedToday :many
-- Returns issues completed today for a team.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name
FROM issue i
JOIN activity_log a ON a.issue_id = i.id
WHERE a.workspace_id = $1
  AND i.team_id = $2
  AND a.action = 'status_changed'
  AND a.created_at >= $3
  AND a.created_at < $4
  AND (a.details->>'to') IN ('done', 'cancelled')
ORDER BY a.created_at DESC;

-- name: GetTeamWeeklyCompletedByAssignee :many
-- Returns completed issue counts by assignee for the past week.
SELECT
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name,
    COUNT(*) AS completed_count
FROM issue i
JOIN activity_log a ON a.issue_id = i.id
WHERE a.workspace_id = $1
  AND i.team_id = $2
  AND a.action = 'status_changed'
  AND a.created_at >= $3
  AND a.created_at < $4
  AND (a.details->>'to') IN ('done', 'cancelled')
GROUP BY assignee_name
ORDER BY completed_count DESC;

-- name: GetTeamNewIssuesCreatedToday :many
-- Returns issues created today for a team.
SELECT
    i.id AS issue_id,
    i.title AS issue_title,
    i.assignee_type,
    i.assignee_id,
    COALESCE(
        CASE WHEN i.assignee_type = 'member' THEN (SELECT u.name FROM member m JOIN "user" u ON u.id = m.user_id WHERE m.user_id = i.assignee_id LIMIT 1)
             WHEN i.assignee_type = 'agent' THEN (SELECT ar.name FROM agent_runtime ar WHERE ar.id = i.assignee_id)
        END,
        'Unassigned'
    ) AS assignee_name
FROM issue i
WHERE i.workspace_id = $1
  AND i.team_id = $2
  AND i.created_at >= $3
  AND i.created_at < $4
ORDER BY i.created_at DESC;
```

- [ ] **Step 2: Run sqlc to regenerate**

Run: `make sqlc`
Expected: generates `server/pkg/db/generated/report.sql.go`

- [ ] **Step 3: Verify it compiles**

Run: `cd server && go build ./...`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add server/pkg/db/queries/report.sql server/pkg/db/generated/
git commit -m "feat(reports): add SQL queries for daily/weekly report data"
```

---

### Task 3: Report Formatter (Slack Block Kit)

**Files:**
- Create: `server/cmd/server/report_formatter.go`

- [ ] **Step 1: Create the formatter file**

```go
// server/cmd/server/report_formatter.go
package main

import (
	"fmt"
	"strings"
	"time"

	"multica/internal/service"
	db "multica/pkg/db/generated"
)

// ---------- Block Kit helpers ----------

func headerBlock(text string) service.SlackBlock {
	return service.SlackBlock{
		"type": "header",
		"text": service.SlackBlock{"type": "plain_text", "text": text},
	}
}

func contextBlock(elements ...string) service.SlackBlock {
	els := make([]service.SlackBlock, len(elements))
	for i, e := range elements {
		els[i] = service.SlackBlock{"type": "mrkdwn", "text": e}
	}
	return service.SlackBlock{"type": "context", "elements": els}
}

func sectionBlock(text string) service.SlackBlock {
	return service.SlackBlock{
		"type": "section",
		"text": service.SlackBlock{"type": "mrkdwn", "text": text},
	}
}

func dividerBlock() service.SlackBlock {
	return service.SlackBlock{"type": "divider"}
}

// ---------- Morning Standup ----------

type MorningData struct {
	TeamName    string
	CycleName   string
	CycleScope  int
	CycleDone   int
	Blockers    []db.GetTeamBlockersRow
	InProgress  []db.GetTeamInProgressIssuesRow
	TodoCount   int64
}

func formatMorningReport(d MorningData, now time.Time) []service.SlackBlock {
	dayName := now.Format("Monday")
	date := now.Format("January 2")
	pct := 0
	if d.CycleScope > 0 {
		pct = d.CycleDone * 100 / d.CycleScope
	}

	blocks := []service.SlackBlock{
		headerBlock(fmt.Sprintf("Morning Standup — %s", d.TeamName)),
	}

	cycleCtx := fmt.Sprintf("%s, %s", dayName, date)
	if d.CycleName != "" {
		cycleCtx += fmt.Sprintf(" · %s · %d/%d done (%d%%)", d.CycleName, d.CycleDone, d.CycleScope, pct)
	}
	blocks = append(blocks, contextBlock(cycleCtx))
	blocks = append(blocks, dividerBlock())

	// Blockers
	if len(d.Blockers) > 0 {
		lines := []string{fmt.Sprintf("*:red_circle: Blockers (%d)*", len(d.Blockers))}
		for _, b := range d.Blockers {
			line := fmt.Sprintf("• %s — %s", b.IssueTitle, b.AssigneeName)
			if b.DaysBlocked > 0 {
				line += fmt.Sprintf(" (%d days)", b.DaysBlocked)
			}
			lines = append(lines, line)
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	// In Progress grouped by assignee
	if len(d.InProgress) > 0 {
		grouped := map[string][]string{}
		order := []string{}
		for _, ip := range d.InProgress {
			name := ip.AssigneeName.(string)
			if _, exists := grouped[name]; !exists {
				order = append(order, name)
			}
			grouped[name] = append(grouped[name], ip.IssueTitle)
		}

		lines := []string{fmt.Sprintf("*:wrench: In Progress (%d)*", len(d.InProgress))}
		for _, name := range order {
			issues := grouped[name]
			lines = append(lines, fmt.Sprintf("  *%s* (%d)", name, len(issues)))
			for _, title := range issues {
				lines = append(lines, fmt.Sprintf("  • %s", title))
			}
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	// To Do count
	if d.TodoCount > 0 {
		blocks = append(blocks, sectionBlock(fmt.Sprintf("*:clipboard: To Do (%d)*\n%d issues waiting", d.TodoCount, d.TodoCount)))
	}

	return blocks
}

// ---------- Evening Recap ----------

type EveningData struct {
	TeamName      string
	Completed     []db.GetTeamCompletedTodayRow
	StatusChanges []db.GetTeamDailySummaryRow
	NewIssues     []db.GetTeamNewIssuesCreatedTodayRow
	CycleName     string
	CyclePctStart int
	CyclePctEnd   int
	CycleDelta    int
}

func formatEveningReport(d EveningData, now time.Time) []service.SlackBlock {
	dayName := now.Format("Monday")
	date := now.Format("January 2")

	blocks := []service.SlackBlock{
		headerBlock(fmt.Sprintf("End of Day — %s", d.TeamName)),
		contextBlock(fmt.Sprintf("%s, %s", dayName, date)),
		dividerBlock(),
	}

	// Completed today
	if len(d.Completed) > 0 {
		lines := []string{fmt.Sprintf("*:white_check_mark: Completed Today (%d)*", len(d.Completed))}
		for _, c := range d.Completed {
			lines = append(lines, fmt.Sprintf("• %s — %s", c.IssueTitle, c.AssigneeName))
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	} else {
		blocks = append(blocks, sectionBlock("*:white_check_mark: Completed Today (0)*\nNo completions today"))
	}

	// Status changes (exclude completions to avoid duplication)
	statusOnly := []db.GetTeamDailySummaryRow{}
	for _, s := range d.StatusChanges {
		if s.Action == "status_changed" {
			details := parseDetails(s.Details)
			to := details["to"]
			if to != "done" && to != "cancelled" {
				statusOnly = append(statusOnly, s)
			}
		}
	}
	if len(statusOnly) > 0 {
		lines := []string{fmt.Sprintf("*:arrows_counterclockwise: Status Changes (%d)*", len(statusOnly))}
		for _, s := range statusOnly {
			details := parseDetails(s.Details)
			lines = append(lines, fmt.Sprintf("• %s → %s", s.IssueTitle, formatStatusName(details["to"])))
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	// New issues
	if len(d.NewIssues) > 0 {
		lines := []string{fmt.Sprintf("*:new: New Issues (%d)*", len(d.NewIssues))}
		for _, n := range d.NewIssues {
			lines = append(lines, fmt.Sprintf("• %s — %s", n.IssueTitle, n.AssigneeName))
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	// Cycle progress delta
	if d.CycleName != "" {
		blocks = append(blocks, dividerBlock())
		emoji := ":chart_with_upwards_trend:"
		if d.CycleDelta == 0 {
			emoji = ":heavy_minus_sign:"
		}
		blocks = append(blocks, sectionBlock(fmt.Sprintf("*%s Cycle Progress*\n%s: %d%% → %d%% (+%d done today)", emoji, d.CycleName, d.CyclePctStart, d.CyclePctEnd, d.CycleDelta)))
	}

	return blocks
}

// ---------- Weekly Report ----------

type WeeklyData struct {
	TeamName         string
	DateRange        string
	CompletedByAssignee []db.GetTeamWeeklyCompletedByAssigneeRow
	TotalCompleted   int
	CycleName        string
	CycleRemaining   int
	CycleEndsAt      string
	CycleCapacity    int
	ScopeAdded       int
	ScopeRemoved     int
	Blockers         []db.GetTeamBlockersRow
}

func formatWeeklyReport(d WeeklyData) []service.SlackBlock {
	blocks := []service.SlackBlock{
		headerBlock(fmt.Sprintf("Weekly Report — %s", d.TeamName)),
		contextBlock(d.DateRange),
		dividerBlock(),
	}

	// Completed by assignee
	if len(d.CompletedByAssignee) > 0 {
		lines := []string{fmt.Sprintf("*:white_check_mark: Completed (%d)*", d.TotalCompleted)}
		for _, a := range d.CompletedByAssignee {
			lines = append(lines, fmt.Sprintf("• %s: %d completed", a.AssigneeName, a.CompletedCount))
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	} else {
		blocks = append(blocks, sectionBlock("*:white_check_mark: Completed (0)*\nNo completions this week"))
	}

	// Cycle health
	if d.CycleName != "" {
		blocks = append(blocks, dividerBlock())
		statusEmoji := ":white_check_mark:"
		statusText := "On track"
		if d.CycleCapacity > 120 {
			statusEmoji = ":warning:"
			statusText = "Over capacity — consider descoping"
		} else if d.CycleCapacity > 100 {
			statusEmoji = ":large_yellow_circle:"
			statusText = "Near capacity"
		}
		lines := []string{
			fmt.Sprintf("*:bar_chart: Cycle Health*"),
			fmt.Sprintf("*%s*", d.CycleName),
			fmt.Sprintf("%d remaining · ends %s · %d%% capacity", d.CycleRemaining, d.CycleEndsAt, d.CycleCapacity),
			fmt.Sprintf("%s %s", statusEmoji, statusText),
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	// Blockers
	if len(d.Blockers) > 0 {
		blocks = append(blocks, dividerBlock())
		lines := []string{fmt.Sprintf("*:red_circle: Blockers (%d)*", len(d.Blockers))}
		for _, b := range d.Blockers {
			line := fmt.Sprintf("• %s — %s", b.IssueTitle, b.AssigneeName)
			if b.DaysBlocked > 0 {
				line += fmt.Sprintf(" (%d days old)", b.DaysBlocked)
			}
			lines = append(lines, line)
		}
		blocks = append(blocks, sectionBlock(strings.Join(lines, "\n")))
	}

	return blocks
}

// ---------- Helpers ----------

func parseDetails(raw []byte) map[string]string {
	var m map[string]string
	_ = json.Unmarshal(raw, &m)
	if m == nil {
		m = map[string]string{}
	}
	return m
}

func formatStatusName(status string) string {
	switch status {
	case "backlog":
		return "Backlog"
	case "todo":
		return "To Do"
	case "in_progress":
		return "In Progress"
	case "in_review":
		return "In Review"
	case "done":
		return "Done"
	case "cancelled":
		return "Cancelled"
	case "blocked":
		return "Blocked"
	default:
		return status
	}
}
```

- [ ] **Step 2: Add missing import**

The file uses `json` in `parseDetails` — add `"encoding/json"` to the imports list alongside the others.

- [ ] **Step 3: Verify it compiles**

Run: `cd server && go build ./...`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add server/cmd/server/report_formatter.go
git commit -m "feat(reports): add Slack Block Kit formatters for all report types"
```

---

### Task 4: Report Scheduler

**Files:**
- Create: `server/cmd/server/report_scheduler.go`
- Modify: `server/cmd/server/main.go`

- [ ] **Step 1: Create the scheduler file**

```go
// server/cmd/server/report_scheduler.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"multica/internal/service"
	db "multica/pkg/db/generated"
)

const reportCheckInterval = 5 * time.Minute

type reportSettings struct {
	Enabled        bool   `json:"enabled"`
	SlackChannelID string `json:"slack_channel_id"`
	MorningTime    string `json:"morning_time"`
	EveningTime    string `json:"evening_time"`
	WeeklyDay      string `json:"weekly_day"`
	WeeklyTime     string `json:"weekly_time"`
}

func runReportScheduler(ctx context.Context, queries *db.Queries, slack *service.SlackService) {
	if !slack.IsConfigured() {
		slog.Info("report-scheduler: SLACK_BOT_TOKEN not set, skipping")
		return
	}

	ticker := time.NewTicker(reportCheckInterval)
	defer ticker.Stop()

	var mu sync.Mutex
	lastSent := map[string]time.Time{}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			checkAndSendReports(ctx, queries, slack, &mu, lastSent)
		}
	}
}

func checkAndSendReports(ctx context.Context, queries *db.Queries, slack *service.SlackService, mu *sync.Mutex, lastSent map[string]time.Time) {
	teams, err := queries.ListAllTeams(ctx)
	if err != nil {
		slog.Error("report-scheduler: list teams", "error", err)
		return
	}

	for _, team := range teams {
		var allSettings struct {
			Reports reportSettings `json:"reports"`
		}
		if err := json.Unmarshal(team.Settings, &allSettings); err != nil {
			continue
		}
		rs := allSettings.Reports
		if !rs.Enabled || rs.SlackChannelID == "" {
			continue
		}

		tz, err := time.LoadLocation(team.Timezone)
		if err != nil {
			tz = time.UTC
		}
		now := time.Now().In(tz)

		// Check morning report
		if rs.MorningTime != "" {
			key := fmt.Sprintf("%s:morning", uuidToString(team.ID))
			if shouldSend(now, rs.MorningTime, key, mu, lastSent) {
				go sendMorningReport(ctx, queries, slack, team, rs, now)
				markSent(key, now, mu, lastSent)
			}
		}

		// Check evening report
		if rs.EveningTime != "" {
			key := fmt.Sprintf("%s:evening", uuidToString(team.ID))
			if shouldSend(now, rs.EveningTime, key, mu, lastSent) {
				go sendEveningReport(ctx, queries, slack, team, rs, now)
				markSent(key, now, mu, lastSent)
			}
		}

		// Check weekly report
		if rs.WeeklyDay != "" && rs.WeeklyTime != "" {
			weekday := parseWeekday(rs.WeeklyDay)
			if now.Weekday() == weekday {
				key := fmt.Sprintf("%s:weekly", uuidToString(team.ID))
				if shouldSend(now, rs.WeeklyTime, key, mu, lastSent) {
					go sendWeeklyReport(ctx, queries, slack, team, rs, now)
					markSent(key, now, mu, lastSent)
				}
			}
		}
	}
}

func shouldSend(now time.Time, targetTime string, key string, mu *sync.Mutex, lastSent map[string]time.Time) bool {
	h, m := parseTime(targetTime)
	nowMins := now.Hour()*60 + now.Minute()
	targetMins := h*60 + m

	// Within 5-minute window
	if nowMins < targetMins || nowMins >= targetMins+5 {
		return false
	}

	mu.Lock()
	defer mu.Unlock()
	last, exists := lastSent[key]
	if exists && now.Sub(last) < 1*time.Hour {
		return false // Already sent recently
	}
	return true
}

func markSent(key string, now time.Time, mu *sync.Mutex, lastSent map[string]time.Time) {
	mu.Lock()
	defer mu.Unlock()
	lastSent[key] = now
}

func parseTime(t string) (int, int) {
	var h, m int
	fmt.Sscanf(t, "%d:%d", &h, &m)
	return h, m
}

func parseWeekday(day string) time.Weekday {
	switch day {
	case "sunday":
		return time.Sunday
	case "monday":
		return time.Monday
	case "tuesday":
		return time.Tuesday
	case "wednesday":
		return time.Wednesday
	case "thursday":
		return time.Thursday
	case "friday":
		return time.Friday
	case "saturday":
		return time.Saturday
	default:
		return time.Sunday
	}
}

func sendMorningReport(ctx context.Context, queries *db.Queries, slack *service.SlackService, team db.Team, rs reportSettings, now time.Time) {
	teamID := team.ID
	wsID := team.WorkspaceID

	blockers, _ := queries.GetTeamBlockers(ctx, teamID)
	inProgress, _ := queries.GetTeamInProgressIssues(ctx, teamID)
	todoCount, _ := queries.GetTeamTodoCount(ctx, teamID)

	// Get active cycle info
	cycleName := ""
	cycleScope := 0
	cycleDone := 0
	if cycle, err := queries.GetActiveCycleForTeam(ctx, teamID); err == nil {
		cycleName = cycle.Name
		if snap, err := queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
			cycleScope = int(snap.TotalCount)
			cycleDone = int(snap.CompletedCount)
		}
	}
	_ = wsID // wsID used in other reports

	data := MorningData{
		TeamName:   team.Name,
		CycleName:  cycleName,
		CycleScope: cycleScope,
		CycleDone:  cycleDone,
		Blockers:   blockers,
		InProgress: inProgress,
		TodoCount:  todoCount,
	}

	blocks := formatMorningReport(data, now)
	if err := slack.PostMessage(rs.SlackChannelID, blocks); err != nil {
		slog.Error("report-scheduler: morning report failed", "team", team.Name, "error", err)
	}
}

func sendEveningReport(ctx context.Context, queries *db.Queries, slack *service.SlackService, team db.Team, rs reportSettings, now time.Time) {
	teamID := team.ID
	wsID := team.WorkspaceID

	tz, _ := time.LoadLocation(team.Timezone)
	if tz == nil {
		tz = time.UTC
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, tz)
	dayEnd := dayStart.Add(24 * time.Hour)

	completed, _ := queries.GetTeamCompletedToday(ctx, db.GetTeamCompletedTodayParams{
		WorkspaceID: wsID, TeamID: teamID, Column3: dayStart, Column4: dayEnd,
	})
	statusChanges, _ := queries.GetTeamDailySummary(ctx, db.GetTeamDailySummaryParams{
		WorkspaceID: wsID, TeamID: teamID, Column3: dayStart, Column4: dayEnd,
	})
	newIssues, _ := queries.GetTeamNewIssuesCreatedToday(ctx, db.GetTeamNewIssuesCreatedTodayParams{
		WorkspaceID: wsID, TeamID: teamID, Column3: dayStart, Column4: dayEnd,
	})

	cycleName := ""
	cycleDelta := len(completed)
	cyclePctStart := 0
	cyclePctEnd := 0
	if cycle, err := queries.GetActiveCycleForTeam(ctx, teamID); err == nil {
		cycleName = cycle.Name
		if snap, err := queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
			scope := int(snap.TotalCount)
			done := int(snap.CompletedCount)
			if scope > 0 {
				cyclePctEnd = done * 100 / scope
				cyclePctStart = (done - cycleDelta) * 100 / scope
			}
		}
	}

	data := EveningData{
		TeamName:      team.Name,
		Completed:     completed,
		StatusChanges: statusChanges,
		NewIssues:     newIssues,
		CycleName:     cycleName,
		CyclePctStart: cyclePctStart,
		CyclePctEnd:   cyclePctEnd,
		CycleDelta:    cycleDelta,
	}

	blocks := formatEveningReport(data, now)
	if err := slack.PostMessage(rs.SlackChannelID, blocks); err != nil {
		slog.Error("report-scheduler: evening report failed", "team", team.Name, "error", err)
	}
}

func sendWeeklyReport(ctx context.Context, queries *db.Queries, slack *service.SlackService, team db.Team, rs reportSettings, now time.Time) {
	teamID := team.ID
	wsID := team.WorkspaceID

	tz, _ := time.LoadLocation(team.Timezone)
	if tz == nil {
		tz = time.UTC
	}
	weekEnd := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, tz)
	weekStart := weekEnd.Add(-7 * 24 * time.Hour)
	dateRange := fmt.Sprintf("%s – %s", weekStart.Format("January 2"), weekEnd.Add(-24*time.Hour).Format("January 2"))

	completedByAssignee, _ := queries.GetTeamWeeklyCompletedByAssignee(ctx, db.GetTeamWeeklyCompletedByAssigneeParams{
		WorkspaceID: wsID, TeamID: teamID, Column3: weekStart, Column4: weekEnd,
	})
	totalCompleted := 0
	for _, a := range completedByAssignee {
		totalCompleted += int(a.CompletedCount)
	}

	blockers, _ := queries.GetTeamBlockers(ctx, teamID)

	cycleName := ""
	cycleRemaining := 0
	cycleEndsAt := ""
	cycleCapacity := 0
	if cycle, err := queries.GetActiveCycleForTeam(ctx, teamID); err == nil {
		cycleName = cycle.Name
		cycleEndsAt = cycle.EndsAt.Time.Format("January 2")
		if snap, err := queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
			scope := int(snap.TotalCount)
			done := int(snap.CompletedCount)
			cycleRemaining = scope - done
		}
		// Use velocity from completed cycles for capacity calc
		if completedCycles, err := queries.GetLastCompletedCyclesForTeam(ctx, teamID); err == nil && len(completedCycles) > 0 {
			sum := 0.0
			for _, cc := range completedCycles {
				count, _ := extractLastHistoryEntry(cc.CompletedScopeHistory)
				sum += float64(count)
			}
			velocity := sum / float64(len(completedCycles))
			if velocity > 0 {
				if snap, err := queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
					cycleCapacity = int(float64(snap.TotalCount) / velocity * 100)
				}
			}
		}
	}

	data := WeeklyData{
		TeamName:            team.Name,
		DateRange:           dateRange,
		CompletedByAssignee: completedByAssignee,
		TotalCompleted:      totalCompleted,
		CycleName:           cycleName,
		CycleRemaining:      cycleRemaining,
		CycleEndsAt:         cycleEndsAt,
		CycleCapacity:       cycleCapacity,
		Blockers:            blockers,
	}

	blocks := formatWeeklyReport(data)
	if err := slack.PostMessage(rs.SlackChannelID, blocks); err != nil {
		slog.Error("report-scheduler: weekly report failed", "team", team.Name, "error", err)
	}
}
```

- [ ] **Step 2: Add ListAllTeams query if it doesn't exist**

Check if `ListAllTeams` exists in `server/pkg/db/queries/team.sql`. If not, add:

```sql
-- name: ListAllTeams :many
SELECT * FROM team ORDER BY position;
```

Then run `make sqlc`.

- [ ] **Step 3: Wire up in main.go**

In `server/cmd/server/main.go`, after line 254 (where `runCycleSweeper` is started), add:

```go
slackSvc := service.NewSlackService(os.Getenv("SLACK_BOT_TOKEN"))
go runReportScheduler(sweepCtx, queries, slackSvc)
```

Add `"multica/internal/service"` to the imports if not already present.

- [ ] **Step 4: Verify it compiles**

Run: `cd server && go build ./...`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add server/cmd/server/report_scheduler.go server/cmd/server/main.go server/pkg/db/queries/team.sql server/pkg/db/generated/
git commit -m "feat(reports): add report scheduler with morning/evening/weekly dispatch"
```

---

### Task 5: Slack Channels API Handler

**Files:**
- Create: `server/internal/handler/slack.go`
- Modify: `server/cmd/server/router.go`

- [ ] **Step 1: Create the handler file**

```go
// server/internal/handler/slack.go
package handler

import (
	"net/http"

	"multica/internal/service"
)

func (h *Handler) ListSlackChannels(w http.ResponseWriter, r *http.Request) {
	if h.Slack == nil || !h.Slack.IsConfigured() {
		writeJSON(w, http.StatusOK, []service.SlackChannel{})
		return
	}

	channels, err := h.Slack.ListChannels()
	if err != nil {
		writeError(w, http.StatusBadGateway, "failed to list Slack channels: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, channels)
}

func (h *Handler) SendTestReport(w http.ResponseWriter, r *http.Request) {
	if h.Slack == nil || !h.Slack.IsConfigured() {
		writeError(w, http.StatusBadRequest, "Slack not configured")
		return
	}

	var req struct {
		ChannelID string `json:"channel_id"`
		TeamID    string `json:"team_id"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.ChannelID == "" || req.TeamID == "" {
		writeError(w, http.StatusBadRequest, "channel_id and team_id required")
		return
	}

	blocks := []service.SlackBlock{
		{"type": "header", "text": service.SlackBlock{"type": "plain_text", "text": "Test Report"}},
		{"type": "section", "text": service.SlackBlock{"type": "mrkdwn", "text": ":white_check_mark: Slack integration is working! Daily reports will be sent to this channel."}},
	}

	if err := h.Slack.PostMessage(req.ChannelID, blocks); err != nil {
		writeError(w, http.StatusBadGateway, "failed to send test message: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}
```

- [ ] **Step 2: Add Slack field to Handler struct**

In `server/internal/handler/handler.go` (or wherever the Handler struct is defined), add:

```go
Slack *service.SlackService
```

Add the import for `"multica/internal/service"` if needed.

- [ ] **Step 3: Initialize Slack in Handler creation**

In `server/cmd/server/main.go` or `router.go`, where the Handler is created, pass the slack service:

```go
h := &handler.Handler{
    // ... existing fields ...
    Slack: slackSvc,
}
```

- [ ] **Step 4: Register routes**

In `server/cmd/server/router.go`, add after the teams route group:

```go
// Slack
r.Route("/api/slack", func(r chi.Router) {
    r.Get("/channels", h.ListSlackChannels)
    r.Post("/test-report", h.SendTestReport)
})
```

- [ ] **Step 5: Verify it compiles**

Run: `cd server && go build ./...`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add server/internal/handler/slack.go server/internal/handler/handler.go server/cmd/server/router.go server/cmd/server/main.go
git commit -m "feat(reports): add Slack channels API and test report endpoint"
```

---

### Task 6: Add slack_configured to App Config

**Files:**
- Modify: `server/internal/handler/config.go`
- Modify: `packages/core/api/client.ts`
- Modify: `packages/core/config/index.ts`

- [ ] **Step 1: Add field to Go AppConfig struct**

In `server/internal/handler/config.go`, add to the `AppConfig` struct:

```go
SlackConfigured bool `json:"slack_configured"`
```

In the `GetConfig` handler, after the PostHog block, add:

```go
if os.Getenv("SLACK_BOT_TOKEN") != "" {
    config.SlackConfigured = true
}
```

- [ ] **Step 2: Update API client type**

In `packages/core/api/client.ts`, update the `getConfig` return type:

```typescript
async getConfig(): Promise<{
    cdn_domain: string;
    allow_signup: boolean;
    google_client_id?: string;
    posthog_key?: string;
    posthog_host?: string;
    slack_configured?: boolean;
}> {
    return this.fetch("/api/config");
}
```

- [ ] **Step 3: Add to config store**

In `packages/core/config/index.ts`, add `slackConfigured` to the state:

```typescript
interface ConfigState {
  cdnDomain: string;
  allowSignup: boolean;
  googleClientId: string;
  slackConfigured: boolean;
  setCdnDomain: (domain: string) => void;
  setAuthConfig: (config: { allowSignup: boolean; googleClientId?: string }) => void;
  setSlackConfigured: (configured: boolean) => void;
}
```

Update the store default and add the setter:

```typescript
export const configStore = createStore<ConfigState>((set) => ({
  cdnDomain: "",
  allowSignup: true,
  googleClientId: "",
  slackConfigured: false,
  setCdnDomain: (domain) => set({ cdnDomain: domain }),
  setAuthConfig: ({ allowSignup, googleClientId = "" }) =>
    set({ allowSignup, googleClientId }),
  setSlackConfigured: (configured) => set({ slackConfigured: configured }),
}));
```

- [ ] **Step 4: Set from auth initializer**

In `packages/core/platform/auth-initializer.tsx`, where `getConfig()` is called and results applied, add:

```typescript
configStore.getState().setSlackConfigured(config.slack_configured ?? false);
```

- [ ] **Step 5: Add listSlackChannels to API client**

In `packages/core/api/client.ts`, add:

```typescript
async listSlackChannels(): Promise<{ id: string; name: string }[]> {
    return this.fetch("/api/slack/channels");
}

async sendTestReport(channelId: string, teamId: string): Promise<void> {
    return this.fetch("/api/slack/test-report", {
        method: "POST",
        body: JSON.stringify({ channel_id: channelId, team_id: teamId }),
    });
}
```

- [ ] **Step 6: Verify it compiles**

Run: `cd server && go build ./...` and `pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add server/internal/handler/config.go packages/core/api/client.ts packages/core/config/index.ts packages/core/platform/auth-initializer.tsx
git commit -m "feat(reports): add slack_configured flag and Slack API client methods"
```

---

### Task 7: Frontend Types

**Files:**
- Modify: `packages/core/types/team.ts`

- [ ] **Step 1: Add ReportSettings to TeamSettings**

In `packages/core/types/team.ts`, add to the `TeamSettings` interface:

```typescript
reports?: {
    enabled: boolean;
    slack_channel_id: string | null;
    slack_channel_name: string | null;
    morning_time: string;
    evening_time: string;
    weekly_day: string;
    weekly_time: string;
};
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/types/team.ts
git commit -m "feat(reports): add ReportSettings type to TeamSettings"
```

---

### Task 8: Team Slack Tab UI

**Files:**
- Modify: `packages/views/teams/components/team-slack-tab.tsx`

- [ ] **Step 1: Replace the placeholder with real implementation**

```tsx
// packages/views/teams/components/team-slack-tab.tsx
"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { Switch } from "@multica/ui/components/ui/switch";
import { useUpdateTeam } from "@multica/core/teams";
import { useConfigStore } from "@multica/core/config";
import { useWorkspaceId } from "@multica/core/hooks";
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
  const wsId = useWorkspaceId();
  const reports = team.settings?.reports;

  const [enabled, setEnabled] = useState(reports?.enabled ?? false);
  const [channelId, setChannelId] = useState(reports?.slack_channel_id ?? "");
  const [channelName, setChannelName] = useState(reports?.slack_channel_name ?? "");
  const [morningTime, setMorningTime] = useState(reports?.morning_time ?? "09:00");
  const [eveningTime, setEveningTime] = useState(reports?.evening_time ?? "17:30");
  const [weeklyDay, setWeeklyDay] = useState(reports?.weekly_day ?? "sunday");
  const [weeklyTime, setWeeklyTime] = useState(reports?.weekly_time ?? "09:00");
  const [testSending, setTestSending] = useState(false);

  useEffect(() => {
    const r = team.settings?.reports;
    setEnabled(r?.enabled ?? false);
    setChannelId(r?.slack_channel_id ?? "");
    setChannelName(r?.slack_channel_name ?? "");
    setMorningTime(r?.morning_time ?? "09:00");
    setEveningTime(r?.evening_time ?? "17:30");
    setWeeklyDay(r?.weekly_day ?? "sunday");
    setWeeklyTime(r?.weekly_time ?? "09:00");
  }, [team]);

  const { data: channels = [], isLoading: channelsLoading } = useQuery({
    queryKey: ["slack", "channels"],
    queryFn: () => api.listSlackChannels(),
    enabled: slackConfigured,
  });

  function save() {
    updateTeam.mutate({
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
        },
      },
    }, {
      onSuccess: () => toast.success("Report settings saved"),
      onError: () => toast.error("Failed to save"),
    });
  }

  async function sendTest() {
    if (!channelId) {
      toast.error("Select a channel first");
      return;
    }
    setTestSending(true);
    try {
      await api.sendTestReport(channelId, team.id);
      toast.success("Test report sent to #" + channelName);
    } catch {
      toast.error("Failed to send test report");
    } finally {
      setTestSending(false);
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
            Slack integration is not configured. Set the <code className="text-xs bg-muted px-1.5 py-0.5 rounded">SLACK_BOT_TOKEN</code> environment variable on the server to enable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Slack Reports</h2>
        <p className="text-sm text-muted-foreground">Automated standup, recap, and weekly reports delivered to a Slack channel.</p>
      </div>

      {/* Channel selection */}
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
                <option value="">
                  {channelsLoading ? "Loading channels..." : "Select a channel"}
                </option>
                {channels.map((ch) => (
                  <option key={ch.id} value={ch.id}>#{ch.name}</option>
                ))}
              </select>
            </div>
          </>
        )}
      </div>

      {/* Schedule */}
      {enabled && channelId && (
        <div className="rounded-lg border p-4 space-y-4">
          <h3 className="text-sm font-semibold">Schedule</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Morning standup</p>
              <p className="text-xs text-muted-foreground">Today's priorities, blockers, in-progress work</p>
            </div>
            <select value={morningTime} onChange={(e) => setMorningTime(e.target.value)} className="rounded-md border bg-background px-3 py-1.5 text-sm">
              {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="border-t" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Evening recap</p>
              <p className="text-xs text-muted-foreground">What got done, status changes, cycle progress</p>
            </div>
            <select value={eveningTime} onChange={(e) => setEveningTime(e.target.value)} className="rounded-md border bg-background px-3 py-1.5 text-sm">
              {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="border-t" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Weekly report</p>
              <p className="text-xs text-muted-foreground">Week summary, velocity, cycle health, blockers</p>
            </div>
            <div className="flex items-center gap-2">
              <select value={weeklyDay} onChange={(e) => setWeeklyDay(e.target.value)} className="rounded-md border bg-background px-3 py-1.5 text-sm">
                {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
              <select value={weeklyTime} onChange={(e) => setWeeklyTime(e.target.value)} className="rounded-md border bg-background px-3 py-1.5 text-sm">
                {TIME_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={updateTeam.isPending}>
          {updateTeam.isPending ? "Saving..." : "Save changes"}
        </Button>
        {enabled && channelId && (
          <Button variant="outline" onClick={sendTest} disabled={testSending}>
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {testSending ? "Sending..." : "Send test report"}
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add packages/views/teams/components/team-slack-tab.tsx
git commit -m "feat(reports): replace Slack tab placeholder with channel picker and schedule UI"
```

---

### Task 9: Set SLACK_BOT_TOKEN and Test End-to-End

- [ ] **Step 1: Set the environment variable**

Add to `.env` (or `.env.worktree`):

```
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token-here
```

- [ ] **Step 2: Restart the backend**

Run: `make server` (or `make start` for full stack)

- [ ] **Step 3: Verify Slack channels endpoint**

Run: `curl -s http://localhost:8080/api/slack/channels -H "Cookie: <session>" | head -c 200`
Expected: JSON array of Slack channels

- [ ] **Step 4: Configure a team in the UI**

1. Navigate to Team Settings > Slack tab
2. Enable reports
3. Select a Slack channel from dropdown
4. Set schedule times
5. Click Save
6. Click "Send test report"

Expected: Test message appears in the selected Slack channel

- [ ] **Step 5: Verify scheduler logs**

Check server logs for `report-scheduler` entries confirming the scheduler is running.

- [ ] **Step 6: Commit env template update**

Add `SLACK_BOT_TOKEN=` (empty) to `.env.example` if it exists, so other developers know the variable is available.

```bash
git add .env.example
git commit -m "docs: add SLACK_BOT_TOKEN to env template"
```
