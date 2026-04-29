package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/multica-ai/multica/server/internal/service"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
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
		ChannelID  string `json:"channel_id"`
		TeamID     string `json:"team_id"`
		ReportType string `json:"report_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request")
		return
	}
	if req.ChannelID == "" || req.TeamID == "" {
		writeError(w, http.StatusBadRequest, "channel_id and team_id required")
		return
	}

	ctx := r.Context()
	teamID := util.ParseUUID(req.TeamID)
	team, err := h.Queries.GetTeam(ctx, teamID)
	if err != nil {
		writeError(w, http.StatusNotFound, "team not found")
		return
	}

	now := time.Now()
	if tz, err := time.LoadLocation(team.Timezone); err == nil {
		now = now.In(tz)
	}

	members := getTeamMemberNames(ctx, h.Queries, teamID)
	var blocks []service.SlackBlock

	switch req.ReportType {
	case "morning":
		blocks = h.buildMorningReport(ctx, teamID, team, members, now)
	case "evening":
		blocks = h.buildEveningReport(ctx, teamID, team, members, now)
	case "weekly":
		blocks = h.buildWeeklyReport(ctx, teamID, team, members, now)
	case "sprint":
		blocks = h.buildSprintReport(ctx, teamID, team, members)
	default:
		writeError(w, http.StatusBadRequest, "report_type must be morning, evening, weekly, or sprint")
		return
	}

	if err := h.Slack.PostMessage(req.ChannelID, blocks); err != nil {
		writeError(w, http.StatusBadGateway, "failed to send report: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "sent"})
}

func (h *Handler) buildMorningReport(ctx context.Context, teamID pgtype.UUID, team db.Team, members []string, now time.Time) []service.SlackBlock {
	blockers, _ := h.Queries.GetTeamBlockers(ctx, teamID)
	inProgress, _ := h.Queries.GetTeamInProgressIssues(ctx, teamID)
	todoIssues, _ := h.Queries.GetTeamTodoIssues(ctx, teamID)
	cycleName, cycleScope, cycleDone := "", 0, 0
	if cycle, err := h.Queries.GetActiveCycleForTeam(ctx, teamID); err == nil {
		cycleName = cycle.Name
		if snap, err := h.Queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
			cycleScope = int(snap.TotalCount)
			cycleDone = int(snap.CompletedCount)
		}
	}
	return FormatMorningReport(MorningReportData{
		TeamName: team.Name, Members: members, CycleName: cycleName, CycleScope: cycleScope,
		CycleDone: cycleDone, Blockers: blockers, InProgress: inProgress, TodoIssues: todoIssues,
	}, now)
}

func (h *Handler) buildEveningReport(ctx context.Context, teamID pgtype.UUID, team db.Team, members []string, now time.Time) []service.SlackBlock {
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	dayEnd := dayStart.Add(24 * time.Hour)
	completed, _ := h.Queries.GetTeamCompletedToday(ctx, db.GetTeamCompletedTodayParams{
		WorkspaceID: team.WorkspaceID, TeamID: teamID,
		CreatedAt: toPgTimestamptz(dayStart), CreatedAt_2: toPgTimestamptz(dayEnd),
	})
	statusChanges, _ := h.Queries.GetTeamDailySummary(ctx, db.GetTeamDailySummaryParams{
		WorkspaceID: team.WorkspaceID, TeamID: teamID,
		CreatedAt: toPgTimestamptz(dayStart), CreatedAt_2: toPgTimestamptz(dayEnd),
	})
	newIssues, _ := h.Queries.GetTeamNewIssuesCreatedToday(ctx, db.GetTeamNewIssuesCreatedTodayParams{
		WorkspaceID: team.WorkspaceID, TeamID: teamID,
		CreatedAt: toPgTimestamptz(dayStart), CreatedAt_2: toPgTimestamptz(dayEnd),
	})
	cycleName, cycleDelta, pctStart, pctEnd := "", len(completed), 0, 0
	if cycle, err := h.Queries.GetActiveCycleForTeam(ctx, teamID); err == nil {
		cycleName = cycle.Name
		if snap, err := h.Queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
			scope := int(snap.TotalCount)
			done := int(snap.CompletedCount)
			if scope > 0 {
				pctEnd = done * 100 / scope
				pctStart = (done - cycleDelta) * 100 / scope
			}
		}
	}
	return FormatEveningReport(EveningReportData{
		TeamName: team.Name, Members: members, Completed: completed, StatusChanges: statusChanges,
		NewIssues: newIssues, CycleName: cycleName,
		CyclePctStart: pctStart, CyclePctEnd: pctEnd, CycleDelta: cycleDelta,
	}, now)
}

func (h *Handler) buildWeeklyReport(ctx context.Context, teamID pgtype.UUID, team db.Team, members []string, now time.Time) []service.SlackBlock {
	weekEnd := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	weekStart := weekEnd.Add(-7 * 24 * time.Hour)
	dateRange := fmt.Sprintf("%s – %s", weekStart.Format("January 2"), weekEnd.Add(-24*time.Hour).Format("January 2"))
	completedItems, _ := h.Queries.GetTeamWeeklyCompletedWithTitles(ctx, db.GetTeamWeeklyCompletedWithTitlesParams{
		WorkspaceID: team.WorkspaceID, TeamID: teamID,
		CreatedAt: toPgTimestamptz(weekStart), CreatedAt_2: toPgTimestamptz(weekEnd),
	})
	blockers, _ := h.Queries.GetTeamBlockers(ctx, teamID)
	inProgress, _ := h.Queries.GetTeamInProgressIssues(ctx, teamID)
	todoIssues, _ := h.Queries.GetTeamTodoIssues(ctx, teamID)
	cycleName, cycleRemaining, cycleEndsAt, cycleCapacity, cycleTotalPts, cycleDonePts := "", 0, "", 0, 0, 0
	velocity := 0.0
	if cycle, err := h.Queries.GetActiveCycleForTeam(ctx, teamID); err == nil {
		cycleName = cycle.Name
		if cycle.EndsAt.Valid {
			cycleEndsAt = cycle.EndsAt.Time.Format("January 2")
		}
		if snap, err := h.Queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
			cycleRemaining = int(snap.TotalCount) - int(snap.CompletedCount)
			cycleTotalPts = int(snap.TotalPoints)
			cycleDonePts = int(snap.CompletedPoints)
		}
		if cc, err := h.Queries.GetLastCompletedCyclesForTeam(ctx, teamID); err == nil && len(cc) > 0 {
			sum := 0.0
			for _, c := range cc {
				_, pts := extractHistoryEntry(c.CompletedScopeHistory)
				sum += float64(pts)
			}
			velocity = sum / float64(len(cc))
			if velocity > 0 {
				if snap, err := h.Queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
					cycleCapacity = int(float64(snap.TotalPoints) / velocity * 100)
				}
			}
		}
	}
	return FormatWeeklyReport(WeeklyReportData{
		TeamName: team.Name, Members: members, DateRange: dateRange, CompletedItems: completedItems,
		InProgress: inProgress, TodoIssues: todoIssues,
		CycleName: cycleName, CycleRemaining: cycleRemaining,
		CycleEndsAt: cycleEndsAt, CycleCapacity: cycleCapacity,
		CycleTotalPts: cycleTotalPts, CycleDonePts: cycleDonePts,
		Velocity: velocity, Blockers: blockers,
	})
}

func (h *Handler) buildSprintReport(ctx context.Context, teamID pgtype.UUID, team db.Team, members []string) []service.SlackBlock {
	inProgress, _ := h.Queries.GetTeamInProgressIssues(ctx, teamID)
	todoIssues, _ := h.Queries.GetTeamTodoIssues(ctx, teamID)
	backlogIssues, _ := h.Queries.GetTeamBacklogIssues(ctx, teamID)
	blockers, _ := h.Queries.GetTeamBlockers(ctx, teamID)

	cycleName, cycleEndsAt := "", ""
	cycleTotalCnt, cycleDoneCnt, cycleTotalPts, cycleDonePts, cycleCapacity := 0, 0, 0, 0, 0
	velocity := 0.0
	if cycle, err := h.Queries.GetActiveCycleForTeam(ctx, teamID); err == nil {
		cycleName = cycle.Name
		if cycle.EndsAt.Valid {
			cycleEndsAt = cycle.EndsAt.Time.Format("January 2")
		}
		if snap, err := h.Queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
			cycleTotalCnt = int(snap.TotalCount)
			cycleDoneCnt = int(snap.CompletedCount)
			cycleTotalPts = int(snap.TotalPoints)
			cycleDonePts = int(snap.CompletedPoints)
		}
		if cc, err := h.Queries.GetLastCompletedCyclesForTeam(ctx, teamID); err == nil && len(cc) > 0 {
			sum := 0.0
			for _, c := range cc {
				_, pts := extractHistoryEntry(c.CompletedScopeHistory)
				sum += float64(pts)
			}
			velocity = sum / float64(len(cc))
			if velocity > 0 {
				if snap, err := h.Queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
					cycleCapacity = int(float64(snap.TotalPoints) / velocity * 100)
				}
			}
		}
	}

	return FormatSprintPlanningReport(SprintPlanningData{
		TeamName: team.Name, Members: members,
		CycleName: cycleName, CycleEndsAt: cycleEndsAt,
		CycleTotalCnt: cycleTotalCnt, CycleDoneCnt: cycleDoneCnt,
		CycleTotalPts: cycleTotalPts, CycleDonePts: cycleDonePts,
		CycleCapacity: cycleCapacity, Velocity: velocity,
		InProgress: inProgress, TodoIssues: todoIssues,
		BacklogIssues: backlogIssues, Blockers: blockers,
	})
}

// sendBugAlertIfNeeded checks if an issue added to a cycle qualifies for a
// Slack bug alert (priority=urgent + label "bug") and posts the appropriate
// message to the team's configured Slack channel.
func (h *Handler) sendBugAlertIfNeeded(ctx context.Context, issue db.Issue) {
	if h.Slack == nil || !h.Slack.IsConfigured() {
		return
	}
	if issue.Priority != "urgent" {
		return
	}

	labels, err := h.Queries.ListIssueLabels(ctx, issue.ID)
	if err != nil {
		return
	}
	hasBug, hasCritical := false, false
	for _, l := range labels {
		switch strings.ToLower(l.Name) {
		case "bug":
			hasBug = true
		case "critical":
			hasCritical = true
		}
	}
	if !hasBug {
		return
	}

	team, err := h.Queries.GetTeam(ctx, issue.TeamID)
	if err != nil {
		return
	}
	var settings struct {
		Reports struct {
			SlackChannelID string `json:"slack_channel_id"`
		} `json:"reports"`
	}
	if err := json.Unmarshal(team.Settings, &settings); err != nil || settings.Reports.SlackChannelID == "" {
		return
	}

	projectName := "—"
	if issue.ProjectID.Valid {
		if p, err := h.Queries.GetProject(ctx, issue.ProjectID); err == nil {
			projectName = p.Title
		}
	}

	assigneeName := "Unassigned"
	if issue.AssigneeID.Valid && issue.AssigneeType.Valid {
		if issue.AssigneeType.String == "member" {
			if u, err := h.Queries.GetUser(ctx, issue.AssigneeID); err == nil {
				assigneeName = u.Name
			}
		} else if issue.AssigneeType.String == "agent" {
			if a, err := h.Queries.GetAgent(ctx, issue.AssigneeID); err == nil {
				assigneeName = a.Name
			}
		}
	}

	prefix := h.getTeamIssuePrefix(ctx, issue.TeamID)
	issueKey := fmt.Sprintf("%s-%d", prefix, issue.Number)

	var severity, sla, emoji string
	if hasCritical {
		severity = "Critical"
		sla = "Immediate"
		emoji = ":rotating_light:"
	} else {
		severity = "Normal"
		sla = "24 Hours"
		emoji = ":warning:"
	}

	blocks := []service.SlackBlock{
		{"type": "header", "text": map[string]any{"type": "plain_text", "text": fmt.Sprintf("%s Bug Alert", emoji)}},
		{"type": "section", "fields": []map[string]any{
			{"type": "mrkdwn", "text": fmt.Sprintf("*Project:*\n%s", projectName)},
			{"type": "mrkdwn", "text": fmt.Sprintf("*Task:*\n%s %s", issueKey, issue.Title)},
			{"type": "mrkdwn", "text": fmt.Sprintf("*Assigned to:*\n%s", assigneeName)},
			{"type": "mrkdwn", "text": fmt.Sprintf("*Severity:*\n%s", severity)},
			{"type": "mrkdwn", "text": fmt.Sprintf("*SLA:*\n%s", sla)},
			{"type": "mrkdwn", "text": "*Impact:*\nClient-facing / Production issue"},
		}},
		{"type": "section", "text": map[string]any{
			"type": "mrkdwn",
			"text": "Please review and update the task immediately.",
		}},
	}

	if err := h.Slack.PostMessage(settings.Reports.SlackChannelID, blocks); err != nil {
		slog.Warn("bug alert slack post failed", "error", err, "issue_id", uuidToString(issue.ID))
	}
}

func getTeamMemberNames(ctx context.Context, queries *db.Queries, teamID pgtype.UUID) []string {
	members, _ := queries.ListTeamMembers(ctx, teamID)
	names := make([]string, len(members))
	for i, m := range members {
		names[i] = m.Name
	}
	return names
}

func toPgTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func extractHistoryEntry(raw []byte) (int, int) {
	if len(raw) == 0 {
		return 0, 0
	}
	var entries []struct {
		Count  int `json:"count"`
		Points int `json:"points"`
	}
	if err := json.Unmarshal(raw, &entries); err != nil || len(entries) == 0 {
		return 0, 0
	}
	last := entries[len(entries)-1]
	return last.Count, last.Points
}
