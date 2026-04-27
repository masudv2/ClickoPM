package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgtype"

	"github.com/multica-ai/multica/server/internal/events"
	"github.com/multica-ai/multica/server/internal/util"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

const cycleSweepInterval = 10 * time.Minute

func runCycleSweeper(ctx context.Context, queries *db.Queries, bus *events.Bus) {
	ticker := time.NewTicker(cycleSweepInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sweepCycles(ctx, queries, bus)
		}
	}
}

func sweepCycles(ctx context.Context, queries *db.Queries, bus *events.Bus) {
	teams, err := queries.ListTeamsWithCyclesEnabled(ctx)
	if err != nil {
		slog.Error("cycle sweeper: failed to list teams", "error", err)
		return
	}

	now := time.Now()
	for _, team := range teams {
		advanceCycleStatus(ctx, queries, bus, team, now)
		autoCreateCycles(ctx, queries, bus, team, now)
		snapshotCycleHistory(ctx, queries, team, now)
		autoAssignIssues(ctx, queries, team)
	}
}

func advanceCycleStatus(ctx context.Context, queries *db.Queries, bus *events.Bus, team db.Team, now time.Time) {
	active, err := queries.GetActiveCycleForTeam(ctx, team.ID)
	if err != nil {
		return
	}

	if !active.EndsAt.Time.Before(now) {
		return
	}

	wsID := util.UUIDToString(team.WorkspaceID)

	var settings struct {
		Cycles struct {
			CooldownWeeks int `json:"cooldown_weeks"`
		} `json:"cycles"`
	}
	_ = json.Unmarshal(team.Settings, &settings)

	if settings.Cycles.CooldownWeeks > 0 && active.Status == "active" {
		cooldownEnd := active.EndsAt.Time.Add(time.Duration(settings.Cycles.CooldownWeeks) * 7 * 24 * time.Hour)
		updated, err := queries.UpdateCycle(ctx, db.UpdateCycleParams{
			ID:             active.ID,
			Status:         pgtype.Text{String: "cooldown", Valid: true},
			CooldownEndsAt: pgtype.Timestamptz{Time: cooldownEnd, Valid: true},
		})
		if err == nil {
			bus.Publish(events.Event{Type: protocol.EventCycleUpdated, WorkspaceID: wsID, Payload: cyclePayload(updated)})
		}
		return
	}

	if active.Status == "cooldown" && active.CooldownEndsAt.Valid && !active.CooldownEndsAt.Time.Before(now) {
		return
	}

	completed, err := queries.UpdateCycle(ctx, db.UpdateCycleParams{
		ID:          active.ID,
		Status:      pgtype.Text{String: "completed", Valid: true},
		CompletedAt: pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		slog.Error("cycle sweeper: failed to complete cycle", "cycle_id", util.UUIDToString(active.ID), "error", err)
		return
	}
	bus.Publish(events.Event{Type: protocol.EventCycleCompleted, WorkspaceID: wsID, Payload: cyclePayload(completed)})

	nextCycles, _ := queries.ListCyclesByStatus(ctx, db.ListCyclesByStatusParams{
		TeamID: team.ID, Status: "planned",
	})
	if len(nextCycles) > 0 {
		_ = queries.MoveUnfinishedIssuesToCycle(ctx, db.MoveUnfinishedIssuesToCycleParams{
			CycleID:   active.ID,
			CycleID_2: nextCycles[0].ID,
		})
		activated, err := queries.UpdateCycle(ctx, db.UpdateCycleParams{
			ID:     nextCycles[0].ID,
			Status: pgtype.Text{String: "active", Valid: true},
		})
		if err == nil {
			bus.Publish(events.Event{Type: protocol.EventCycleStarted, WorkspaceID: wsID, Payload: cyclePayload(activated)})
		}
	}
}

func autoCreateCycles(ctx context.Context, queries *db.Queries, bus *events.Bus, team db.Team, now time.Time) {
	var settings struct {
		Cycles struct {
			Enabled         bool `json:"enabled"`
			DurationWeeks   int  `json:"duration_weeks"`
			CooldownWeeks   int  `json:"cooldown_weeks"`
			AutoCreateCount int  `json:"auto_create_count"`
		} `json:"cycles"`
	}
	_ = json.Unmarshal(team.Settings, &settings)

	if settings.Cycles.AutoCreateCount <= 0 || settings.Cycles.DurationWeeks <= 0 {
		return
	}

	plannedCount, _ := queries.CountPlannedCycles(ctx, team.ID)
	needed := int64(settings.Cycles.AutoCreateCount) - plannedCount
	if needed <= 0 {
		return
	}

	// Get last cycle end date as time.Time
	var lastEnd time.Time
	lastEndRaw, err := queries.GetLastCycleEndDate(ctx, team.ID)
	if err == nil {
		switch v := lastEndRaw.(type) {
		case time.Time:
			lastEnd = v
		default:
			lastEnd = now
		}
	} else {
		lastEnd = now
	}

	maxNum, _ := queries.GetMaxCycleNumber(ctx, team.ID)
	maxPos, _ := queries.GetMaxCyclePosition(ctx, team.ID)
	wsID := util.UUIDToString(team.WorkspaceID)
	duration := time.Duration(settings.Cycles.DurationWeeks) * 7 * 24 * time.Hour
	cooldown := time.Duration(settings.Cycles.CooldownWeeks) * 7 * 24 * time.Hour

	for i := int64(0); i < needed; i++ {
		num := maxNum + int32(i) + 1
		start := lastEnd.Add(time.Duration(i) * (duration + cooldown))
		end := start.Add(duration)

		cycle, err := queries.CreateCycle(ctx, db.CreateCycleParams{
			WorkspaceID: team.WorkspaceID,
			TeamID:      team.ID,
			Name:        fmt.Sprintf("Cycle %d", num),
			Number:      num,
			Status:      "planned",
			StartsAt:    pgtype.Timestamptz{Time: start, Valid: true},
			EndsAt:      pgtype.Timestamptz{Time: end, Valid: true},
			Position:    float32(maxPos) + float32(i) + 1,
		})
		if err != nil {
			slog.Error("cycle sweeper: failed to create cycle", "team", team.Name, "error", err)
			continue
		}
		bus.Publish(events.Event{Type: protocol.EventCycleCreated, WorkspaceID: wsID, Payload: cyclePayload(cycle)})
	}
}

func snapshotCycleHistory(ctx context.Context, queries *db.Queries, team db.Team, now time.Time) {
	active, err := queries.GetActiveCycleForTeam(ctx, team.ID)
	if err != nil {
		return
	}

	dateStr := now.Format("2006-01-02")
	var existing []struct {
		Date string `json:"date"`
	}
	_ = json.Unmarshal(active.ScopeHistory, &existing)
	for _, e := range existing {
		if e.Date == dateStr {
			return
		}
	}

	snap, err := queries.GetCycleScopeSnapshot(ctx, active.ID)
	if err != nil {
		return
	}

	entry := map[string]any{"date": dateStr, "count": snap.TotalCount, "points": snap.TotalPoints}
	startedEntry := map[string]any{"date": dateStr, "count": snap.StartedCount, "points": snap.StartedPoints}
	completedEntry := map[string]any{"date": dateStr, "count": snap.CompletedCount, "points": snap.CompletedPoints}

	scopeHist := appendJSONArray(active.ScopeHistory, entry)
	startedHist := appendJSONArray(active.StartedScopeHistory, startedEntry)
	completedHist := appendJSONArray(active.CompletedScopeHistory, completedEntry)

	_, _ = queries.UpdateCycle(ctx, db.UpdateCycleParams{
		ID:                    active.ID,
		ScopeHistory:          scopeHist,
		CompletedScopeHistory: completedHist,
		StartedScopeHistory:   startedHist,
	})
}

func autoAssignIssues(ctx context.Context, queries *db.Queries, team db.Team) {
	var settings struct {
		Cycles struct {
			AutoAddStarted   bool `json:"auto_add_started"`
			AutoAddCompleted bool `json:"auto_add_completed"`
		} `json:"cycles"`
	}
	_ = json.Unmarshal(team.Settings, &settings)

	if !settings.Cycles.AutoAddStarted && !settings.Cycles.AutoAddCompleted {
		return
	}

	active, err := queries.GetActiveCycleForTeam(ctx, team.ID)
	if err != nil {
		return
	}

	targetCycleID := active.ID
	if active.Status == "cooldown" {
		nextCycles, _ := queries.ListCyclesByStatus(ctx, db.ListCyclesByStatusParams{
			TeamID: team.ID, Status: "planned",
		})
		if len(nextCycles) == 0 {
			return
		}
		targetCycleID = nextCycles[0].ID
	}

	var statuses []string
	if settings.Cycles.AutoAddStarted {
		statuses = append(statuses, "in_progress")
	}
	if settings.Cycles.AutoAddCompleted {
		statuses = append(statuses, "done", "cancelled")
	}

	_ = queries.AutoAssignIssuesToCycle(ctx, db.AutoAssignIssuesToCycleParams{
		TeamID:  team.ID,
		CycleID: targetCycleID,
		Column3: statuses,
	})
}

func appendJSONArray(existing []byte, entry map[string]any) []byte {
	var arr []any
	_ = json.Unmarshal(existing, &arr)
	arr = append(arr, entry)
	result, _ := json.Marshal(arr)
	return result
}

func cyclePayload(c db.Cycle) map[string]any {
	return map[string]any{
		"id":        util.UUIDToString(c.ID),
		"team_id":   util.UUIDToString(c.TeamID),
		"name":      c.Name,
		"number":    c.Number,
		"status":    c.Status,
		"starts_at": c.StartsAt.Time.Format(time.RFC3339),
		"ends_at":   c.EndsAt.Time.Format(time.RFC3339),
	}
}
