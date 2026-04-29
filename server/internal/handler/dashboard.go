package handler

import (
	"encoding/json"
	"math"
	"net/http"
	"strconv"

	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

// --- Response types ---

type DashboardStatsResponse struct {
	OpenCount      int     `json:"open_count"`
	OverdueCount   int     `json:"overdue_count"`
	CompletionRate float64 `json:"completion_rate"`
	AvgVelocity    float64 `json:"avg_velocity"`
}

type CycleSummaryResponse struct {
	ID                    string          `json:"id"`
	Name                  string          `json:"name"`
	StartsAt              string          `json:"starts_at"`
	EndsAt                string          `json:"ends_at"`
	ScopeCount            int             `json:"scope_count"`
	ScopePoints           int             `json:"scope_points"`
	CompletedCount        int             `json:"completed_count"`
	CompletedPoints       int             `json:"completed_points"`
	ScopeHistory          json.RawMessage `json:"scope_history"`
	CompletedScopeHistory json.RawMessage `json:"completed_scope_history"`
}

type TeamHealthResponse struct {
	TeamID           string                `json:"team_id"`
	TeamName         string                `json:"team_name"`
	TeamColor        string                `json:"team_color"`
	TeamIdentifier   string                `json:"team_identifier"`
	ActiveCycle      *CycleSummaryResponse `json:"active_cycle"`
	Velocity         float64               `json:"velocity"`
	BlockerCount     int                   `json:"blocker_count"`
	EstimatesEnabled bool                  `json:"estimates_enabled"`
}

type VelocityDataPoint struct {
	TeamID      string `json:"team_id"`
	TeamName    string `json:"team_name"`
	TeamColor   string `json:"team_color"`
	CycleName   string `json:"cycle_name"`
	CycleNumber int    `json:"cycle_number"`
	StartsAt    string `json:"starts_at"`
	EndsAt      string `json:"ends_at"`
	Count       int    `json:"count"`
	Points      int    `json:"points"`
	Committed   int    `json:"committed"`
	Unplanned   int    `json:"unplanned"`
	Removed     int    `json:"removed"`
}

type DashboardBlockerResponse struct {
	ID           string  `json:"id"`
	Identifier   string  `json:"identifier"`
	Title        string  `json:"title"`
	Status       string  `json:"status"`
	Priority     string  `json:"priority"`
	AssigneeType *string `json:"assignee_type"`
	AssigneeID   *string `json:"assignee_id"`
	DueDate      *string `json:"due_date"`
	TeamID       string  `json:"team_id"`
	TeamName     string  `json:"team_name"`
	TeamColor    string  `json:"team_color"`
}

type DashboardActivityResponse struct {
	ID        string          `json:"id"`
	IssueID   *string         `json:"issue_id"`
	ActorType string          `json:"actor_type"`
	ActorID   string          `json:"actor_id"`
	Action    string          `json:"action"`
	Details   json.RawMessage `json:"details"`
	CreatedAt string          `json:"created_at"`
}

type DashboardResponse struct {
	Stats    DashboardStatsResponse      `json:"stats"`
	Teams    []TeamHealthResponse        `json:"teams"`
	Velocity []VelocityDataPoint         `json:"velocity"`
	Activity []DashboardActivityResponse `json:"activity"`
	Blockers []DashboardBlockerResponse  `json:"blockers"`
}

func (h *Handler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	// Role check: owner or admin only
	member, ok := ctxMember(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if member.Role != "owner" && member.Role != "admin" {
		writeError(w, http.StatusForbidden, "insufficient permissions")
		return
	}

	wsID := ctxWorkspaceID(r.Context())
	if wsID == "" {
		writeError(w, http.StatusBadRequest, "workspace ID required")
		return
	}

	cycleCountStr := r.URL.Query().Get("cycle_count")
	cycleCount := 6
	if cycleCountStr != "" {
		if n, err := strconv.Atoi(cycleCountStr); err == nil && (n == 3 || n == 6 || n == 12) {
			cycleCount = n
		}
	}

	ctx := r.Context()
	wsUUID := parseUUID(wsID)

	// 1. Get stats
	stats, err := h.Queries.GetDashboardStats(ctx, wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get dashboard stats")
		return
	}

	// 2. Get all teams
	teams, err := h.Queries.ListTeams(ctx, wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list teams")
		return
	}

	// 3. Get blockers
	blockers, err := h.Queries.GetDashboardBlockers(ctx, wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get blockers")
		return
	}

	// 4. Get completed cycles for velocity
	completedCycles, err := h.Queries.ListCompletedCyclesForDashboard(ctx, db.ListCompletedCyclesForDashboardParams{
		WorkspaceID: wsUUID,
		Limit:       int32(cycleCount * len(teams)),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list completed cycles")
		return
	}

	// 5. Get activities
	activities, err := h.Queries.ListWorkspaceActivities(ctx, db.ListWorkspaceActivitiesParams{
		WorkspaceID: wsUUID,
		Column2:     []string{"status_changed", "issue_created", "cycle_status_changed"},
		Limit:       20,
		Offset:      0,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list activities")
		return
	}

	// 6. Build per-team blocker counts
	blockersByTeam := map[string]int{}
	for _, b := range blockers {
		blockersByTeam[uuidToString(b.TeamID)]++
	}

	// Build velocity data and compute per-team avg velocity
	velocityData := []VelocityDataPoint{}
	teamVelocityCounts := map[string][]float64{}
	for _, c := range completedCycles {
		teamID := uuidToString(c.TeamID)
		count, points := extractLastHistoryEntry(c.CompletedScopeHistory)
		committedCount, _ := extractFirstHistoryEntry(c.ScopeHistory)
		finalScope, _ := extractLastHistoryEntry(c.ScopeHistory)

		// For active cycles, get live snapshot instead of historical data
		if c.Status == "active" {
			snapshot, snapErr := h.Queries.GetCycleScopeSnapshot(ctx, c.ID)
			if snapErr == nil {
				count = int(snapshot.CompletedCount)
				points = int(snapshot.CompletedPoints)
				finalScope = int(snapshot.TotalCount)
			}
		}

		unplanned := 0
		removed := 0
		if finalScope > committedCount {
			unplanned = finalScope - committedCount
		} else if committedCount > finalScope {
			removed = committedCount - finalScope
		}

		velocityData = append(velocityData, VelocityDataPoint{
			TeamID:      teamID,
			TeamName:    c.TeamName,
			TeamColor:   c.TeamColor,
			CycleName:   c.Name,
			CycleNumber: int(c.Number),
			StartsAt:    timestampToString(c.StartsAt),
			EndsAt:      timestampToString(c.EndsAt),
			Count:       count,
			Points:      points,
			Committed:   finalScope,
			Unplanned:   unplanned,
			Removed:     removed,
		})
		// Only count completed cycles for velocity average
		if c.Status == "completed" {
			teamVelocityCounts[teamID] = append(teamVelocityCounts[teamID], float64(count))
		}
	}

	// Build team health + compute completion rate from active cycles
	totalScope := 0
	totalCompleted := 0

	teamHealths := make([]TeamHealthResponse, 0, len(teams))
	for _, team := range teams {
		teamID := uuidToString(team.ID)

		th := TeamHealthResponse{
			TeamID:         teamID,
			TeamName:       team.Name,
			TeamColor:      team.Color,
			TeamIdentifier: team.Identifier,
			BlockerCount:   blockersByTeam[teamID],
		}

		// Parse team settings for estimates config
		var settings struct {
			Estimates struct {
				Enabled bool `json:"enabled"`
			} `json:"estimates"`
		}
		if team.Settings != nil {
			json.Unmarshal(team.Settings, &settings)
		}
		th.EstimatesEnabled = settings.Estimates.Enabled

		// Get active cycle
		activeCycle, err := h.Queries.GetActiveCycleForTeam(ctx, team.ID)
		if err == nil {
			snapshot, snapErr := h.Queries.GetCycleScopeSnapshot(ctx, activeCycle.ID)
			if snapErr == nil {
				totalScope += int(snapshot.TotalCount)
				totalCompleted += int(snapshot.CompletedCount)
				th.ActiveCycle = &CycleSummaryResponse{
					ID:                    uuidToString(activeCycle.ID),
					Name:                  activeCycle.Name,
					StartsAt:              timestampToString(activeCycle.StartsAt),
					EndsAt:                timestampToString(activeCycle.EndsAt),
					ScopeCount:            int(snapshot.TotalCount),
					ScopePoints:           int(snapshot.TotalPoints),
					CompletedCount:        int(snapshot.CompletedCount),
					CompletedPoints:       int(snapshot.CompletedPoints),
					ScopeHistory:          activeCycle.ScopeHistory,
					CompletedScopeHistory: activeCycle.CompletedScopeHistory,
				}
			}
		}

		// Avg velocity from last 3 completed cycles for this team
		if vals, ok := teamVelocityCounts[teamID]; ok {
			limit := 3
			if len(vals) < limit {
				limit = len(vals)
			}
			sum := 0.0
			for _, v := range vals[:limit] {
				sum += v
			}
			if limit > 0 {
				th.Velocity = math.Round(sum/float64(limit)*10) / 10
			}
		}

		teamHealths = append(teamHealths, th)
	}

	completionRate := 0.0
	if totalScope > 0 {
		completionRate = math.Round(float64(totalCompleted)/float64(totalScope)*1000) / 10
	}

	// Avg velocity across all teams
	allVelocities := 0.0
	teamCount := 0
	for _, th := range teamHealths {
		if th.Velocity > 0 {
			allVelocities += th.Velocity
			teamCount++
		}
	}
	avgVelocity := 0.0
	if teamCount > 0 {
		avgVelocity = math.Round(allVelocities/float64(teamCount)*10) / 10
	}

	// Build blocker responses
	blockerResponses := make([]DashboardBlockerResponse, 0, len(blockers))
	for _, b := range blockers {
		blockerResponses = append(blockerResponses, DashboardBlockerResponse{
			ID:           uuidToString(b.ID),
			Identifier:   b.TeamIdentifier + "-" + strconv.Itoa(int(b.Number)),
			Title:        b.Title,
			Status:       b.Status,
			Priority:     b.Priority,
			AssigneeType: textToPtr(b.AssigneeType),
			AssigneeID:   uuidToPtr(b.AssigneeID),
			DueDate:      timestampToPtr(b.DueDate),
			TeamID:       uuidToString(b.TeamID),
			TeamName:     b.TeamName,
			TeamColor:    b.TeamColor,
		})
	}

	// Build activity responses
	activityResponses := make([]DashboardActivityResponse, 0, len(activities))
	for _, a := range activities {
		activityResponses = append(activityResponses, DashboardActivityResponse{
			ID:        uuidToString(a.ID),
			IssueID:   uuidToPtr(a.IssueID),
			ActorType: a.ActorType.String,
			ActorID:   uuidToString(a.ActorID),
			Action:    a.Action,
			Details:   a.Details,
			CreatedAt: timestampToString(a.CreatedAt),
		})
	}

	resp := DashboardResponse{
		Stats: DashboardStatsResponse{
			OpenCount:      int(stats.OpenCount),
			OverdueCount:   int(stats.OverdueCount),
			CompletionRate: completionRate,
			AvgVelocity:    avgVelocity,
		},
		Teams:    teamHealths,
		Velocity: velocityData,
		Activity: activityResponses,
		Blockers: blockerResponses,
	}

	writeJSON(w, http.StatusOK, resp)
}

// extractFirstHistoryEntry reads the first entry from a scope_history JSONB array.
func extractFirstHistoryEntry(raw []byte) (int, int) {
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
	first := entries[0]
	return first.Count, first.Points
}

// extractLastHistoryEntry reads the last entry from a scope_history JSONB array.
func extractLastHistoryEntry(raw []byte) (int, int) {
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
