package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/multica-ai/multica/server/internal/handler"
	"github.com/multica-ai/multica/server/internal/service"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

const reportCheckInterval = 5 * time.Minute

type reportSettings struct {
	Enabled        bool   `json:"enabled"`
	SlackChannelID string `json:"slack_channel_id"`
	MorningTime    string `json:"morning_time"`
	EveningTime    string `json:"evening_time"`
	WeeklyDay      string `json:"weekly_day"`
	WeeklyTime     string `json:"weekly_time"`
	SprintDay      string `json:"sprint_day"`
	SprintTime     string `json:"sprint_time"`
}

func runReportScheduler(ctx context.Context, queries *db.Queries, slack *service.SlackService) {
	if !slack.IsConfigured() {
		slog.Info("report-scheduler: SLACK_BOT_TOKEN not set, skipping")
		return
	}

	slog.Info("report-scheduler: started")

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
	teams, err := queries.ListTeamsWithReportsEnabled(ctx)
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
		teamIDStr := util.UUIDToString(team.ID)

		if rs.MorningTime != "" {
			key := teamIDStr + ":morning"
			if shouldSendReport(now, rs.MorningTime, key, mu, lastSent) {
				go sendMorningReport(ctx, queries, slack, team, rs, now)
				markReportSent(key, now, mu, lastSent)
			}
		}

		if rs.EveningTime != "" {
			key := teamIDStr + ":evening"
			if shouldSendReport(now, rs.EveningTime, key, mu, lastSent) {
				go sendEveningReport(ctx, queries, slack, team, rs, now)
				markReportSent(key, now, mu, lastSent)
			}
		}

		if rs.WeeklyDay != "" && rs.WeeklyTime != "" {
			weekday := parseWeekday(rs.WeeklyDay)
			if now.Weekday() == weekday {
				key := teamIDStr + ":weekly"
				if shouldSendReport(now, rs.WeeklyTime, key, mu, lastSent) {
					go sendWeeklyReport(ctx, queries, slack, team, rs, now)
					markReportSent(key, now, mu, lastSent)
				}
			}
		}

		if rs.SprintDay != "" && rs.SprintTime != "" {
			weekday := parseWeekday(rs.SprintDay)
			if now.Weekday() == weekday {
				key := teamIDStr + ":sprint"
				if shouldSendReport(now, rs.SprintTime, key, mu, lastSent) {
					go sendSprintReport(ctx, queries, slack, team, rs)
					markReportSent(key, now, mu, lastSent)
				}
			}
		}
	}
}

func shouldSendReport(now time.Time, targetTime string, key string, mu *sync.Mutex, lastSent map[string]time.Time) bool {
	h, m := parseReportTime(targetTime)
	nowMins := now.Hour()*60 + now.Minute()
	targetMins := h*60 + m

	if nowMins < targetMins || nowMins >= targetMins+5 {
		return false
	}

	mu.Lock()
	defer mu.Unlock()
	last, exists := lastSent[key]
	if exists && now.Sub(last) < 1*time.Hour {
		return false
	}
	return true
}

func markReportSent(key string, now time.Time, mu *sync.Mutex, lastSent map[string]time.Time) {
	mu.Lock()
	defer mu.Unlock()
	lastSent[key] = now
}

func parseReportTime(t string) (int, int) {
	var h, m int
	fmt.Sscanf(t, "%d:%d", &h, &m)
	return h, m
}

func parseWeekday(day string) time.Weekday {
	switch day {
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

func toPgTimestamptz(t time.Time) pgtype.Timestamptz {
	return pgtype.Timestamptz{Time: t, Valid: true}
}

func getTeamMemberNames(ctx context.Context, queries *db.Queries, teamID pgtype.UUID) []string {
	members, _ := queries.ListTeamMembers(ctx, teamID)
	names := make([]string, len(members))
	for i, m := range members {
		names[i] = m.Name
	}
	return names
}

func sendMorningReport(ctx context.Context, queries *db.Queries, slack *service.SlackService, team db.Team, rs reportSettings, now time.Time) {
	members := getTeamMemberNames(ctx, queries, team.ID)
	blockers, _ := queries.GetTeamBlockers(ctx, team.ID)
	inProgress, _ := queries.GetTeamInProgressIssues(ctx, team.ID)
	todoIssues, _ := queries.GetTeamTodoIssues(ctx, team.ID)

	cycleName := ""
	cycleScope := 0
	cycleDone := 0
	if cycle, err := queries.GetActiveCycleForTeam(ctx, team.ID); err == nil {
		cycleName = cycle.Name
		if snap, err := queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
			cycleScope = int(snap.TotalCount)
			cycleDone = int(snap.CompletedCount)
		}
	}

	blocks := handler.FormatMorningReport(handler.MorningReportData{
		TeamName:   team.Name,
		Members:    members,
		CycleName:  cycleName,
		CycleScope: cycleScope,
		CycleDone:  cycleDone,
		Blockers:   blockers,
		InProgress: inProgress,
		TodoIssues: todoIssues,
	}, now)

	if err := slack.PostMessage(rs.SlackChannelID, blocks); err != nil {
		slog.Error("report-scheduler: morning report failed", "team", team.Name, "error", err)
	}
}

func sendEveningReport(ctx context.Context, queries *db.Queries, slack *service.SlackService, team db.Team, rs reportSettings, now time.Time) {
	members := getTeamMemberNames(ctx, queries, team.ID)
	tz, _ := time.LoadLocation(team.Timezone)
	if tz == nil {
		tz = time.UTC
	}
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, tz)
	dayEnd := dayStart.Add(24 * time.Hour)

	completed, _ := queries.GetTeamCompletedToday(ctx, db.GetTeamCompletedTodayParams{
		WorkspaceID: team.WorkspaceID,
		TeamID:      team.ID,
		CreatedAt:   toPgTimestamptz(dayStart),
		CreatedAt_2: toPgTimestamptz(dayEnd),
	})
	statusChanges, _ := queries.GetTeamDailySummary(ctx, db.GetTeamDailySummaryParams{
		WorkspaceID: team.WorkspaceID,
		TeamID:      team.ID,
		CreatedAt:   toPgTimestamptz(dayStart),
		CreatedAt_2: toPgTimestamptz(dayEnd),
	})
	newIssues, _ := queries.GetTeamNewIssuesCreatedToday(ctx, db.GetTeamNewIssuesCreatedTodayParams{
		WorkspaceID: team.WorkspaceID,
		TeamID:      team.ID,
		CreatedAt:   toPgTimestamptz(dayStart),
		CreatedAt_2: toPgTimestamptz(dayEnd),
	})

	cycleName := ""
	cycleDelta := len(completed)
	cyclePctStart := 0
	cyclePctEnd := 0
	if cycle, err := queries.GetActiveCycleForTeam(ctx, team.ID); err == nil {
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

	blocks := handler.FormatEveningReport(handler.EveningReportData{
		TeamName:      team.Name,
		Members:       members,
		Completed:     completed,
		StatusChanges: statusChanges,
		NewIssues:     newIssues,
		CycleName:     cycleName,
		CyclePctStart: cyclePctStart,
		CyclePctEnd:   cyclePctEnd,
		CycleDelta:    cycleDelta,
	}, now)

	if err := slack.PostMessage(rs.SlackChannelID, blocks); err != nil {
		slog.Error("report-scheduler: evening report failed", "team", team.Name, "error", err)
	}
}

func sendWeeklyReport(ctx context.Context, queries *db.Queries, slack *service.SlackService, team db.Team, rs reportSettings, now time.Time) {
	members := getTeamMemberNames(ctx, queries, team.ID)
	tz, _ := time.LoadLocation(team.Timezone)
	if tz == nil {
		tz = time.UTC
	}
	weekEnd := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, tz)
	weekStart := weekEnd.Add(-7 * 24 * time.Hour)
	dateRange := fmt.Sprintf("%s – %s", weekStart.Format("January 2"), weekEnd.Add(-24*time.Hour).Format("January 2"))

	completedItems, _ := queries.GetTeamWeeklyCompletedWithTitles(ctx, db.GetTeamWeeklyCompletedWithTitlesParams{
		WorkspaceID: team.WorkspaceID,
		TeamID:      team.ID,
		CreatedAt:   toPgTimestamptz(weekStart),
		CreatedAt_2: toPgTimestamptz(weekEnd),
	})

	blockers, _ := queries.GetTeamBlockers(ctx, team.ID)
	inProgress, _ := queries.GetTeamInProgressIssues(ctx, team.ID)
	todoIssues, _ := queries.GetTeamTodoIssues(ctx, team.ID)

	cycleName := ""
	cycleRemaining := 0
	cycleEndsAt := ""
	cycleCapacity := 0
	cycleTotalPts := 0
	cycleDonePts := 0
	velocity := 0.0
	if cycle, err := queries.GetActiveCycleForTeam(ctx, team.ID); err == nil {
		cycleName = cycle.Name
		if cycle.EndsAt.Valid {
			cycleEndsAt = cycle.EndsAt.Time.Format("January 2")
		}
		if snap, err := queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
			cycleRemaining = int(snap.TotalCount) - int(snap.CompletedCount)
			cycleTotalPts = int(snap.TotalPoints)
			cycleDonePts = int(snap.CompletedPoints)
		}
		if completedCycles, err := queries.GetLastCompletedCyclesForTeam(ctx, team.ID); err == nil && len(completedCycles) > 0 {
			sum := 0.0
			for _, cc := range completedCycles {
				_, pts := extractReportHistoryEntry(cc.CompletedScopeHistory)
				sum += float64(pts)
			}
			velocity = sum / float64(len(completedCycles))
			if velocity > 0 {
				if snap, err := queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
					cycleCapacity = int(float64(snap.TotalPoints) / velocity * 100)
				}
			}
		}
	}

	blocks := handler.FormatWeeklyReport(handler.WeeklyReportData{
		TeamName:       team.Name,
		Members:        members,
		DateRange:      dateRange,
		CompletedItems: completedItems,
		InProgress:     inProgress,
		TodoIssues:     todoIssues,
		CycleName:      cycleName,
		CycleRemaining: cycleRemaining,
		CycleEndsAt:    cycleEndsAt,
		CycleCapacity:  cycleCapacity,
		CycleTotalPts:  cycleTotalPts,
		CycleDonePts:   cycleDonePts,
		Velocity:       velocity,
		Blockers:       blockers,
	})

	if err := slack.PostMessage(rs.SlackChannelID, blocks); err != nil {
		slog.Error("report-scheduler: weekly report failed", "team", team.Name, "error", err)
	}
}

func sendSprintReport(ctx context.Context, queries *db.Queries, slack *service.SlackService, team db.Team, rs reportSettings) {
	members := getTeamMemberNames(ctx, queries, team.ID)
	inProgress, _ := queries.GetTeamInProgressIssues(ctx, team.ID)
	todoIssues, _ := queries.GetTeamTodoIssues(ctx, team.ID)
	backlogIssues, _ := queries.GetTeamBacklogIssues(ctx, team.ID)
	blockers, _ := queries.GetTeamBlockers(ctx, team.ID)

	cycleName, cycleEndsAt := "", ""
	cycleTotalCnt, cycleDoneCnt, cycleTotalPts, cycleDonePts, cycleCapacity := 0, 0, 0, 0, 0
	velocity := 0.0
	if cycle, err := queries.GetActiveCycleForTeam(ctx, team.ID); err == nil {
		cycleName = cycle.Name
		if cycle.EndsAt.Valid {
			cycleEndsAt = cycle.EndsAt.Time.Format("January 2")
		}
		if snap, err := queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
			cycleTotalCnt = int(snap.TotalCount)
			cycleDoneCnt = int(snap.CompletedCount)
			cycleTotalPts = int(snap.TotalPoints)
			cycleDonePts = int(snap.CompletedPoints)
		}
		if completedCycles, err := queries.GetLastCompletedCyclesForTeam(ctx, team.ID); err == nil && len(completedCycles) > 0 {
			sum := 0.0
			for _, cc := range completedCycles {
				_, pts := extractReportHistoryEntry(cc.CompletedScopeHistory)
				sum += float64(pts)
			}
			velocity = sum / float64(len(completedCycles))
			if velocity > 0 {
				if snap, err := queries.GetCycleScopeSnapshot(ctx, cycle.ID); err == nil {
					cycleCapacity = int(float64(snap.TotalPoints) / velocity * 100)
				}
			}
		}
	}

	blocks := handler.FormatSprintPlanningReport(handler.SprintPlanningData{
		TeamName:      team.Name,
		Members:       members,
		CycleName:     cycleName,
		CycleEndsAt:   cycleEndsAt,
		CycleTotalCnt: cycleTotalCnt,
		CycleDoneCnt:  cycleDoneCnt,
		CycleTotalPts: cycleTotalPts,
		CycleDonePts:  cycleDonePts,
		CycleCapacity: cycleCapacity,
		Velocity:      velocity,
		InProgress:    inProgress,
		TodoIssues:    todoIssues,
		BacklogIssues: backlogIssues,
		Blockers:      blockers,
	})

	if err := slack.PostMessage(rs.SlackChannelID, blocks); err != nil {
		slog.Error("report-scheduler: sprint report failed", "team", team.Name, "error", err)
	}
}

func extractReportHistoryEntry(raw []byte) (int, int) {
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
