package handler

import (
	"math"
	"net/http"
	"strconv"

	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type WorkloadMemberEntry struct {
	AssigneeType        string `json:"assignee_type"`
	AssigneeID          string `json:"assignee_id"`
	IssueCount          int64  `json:"issue_count"`
	AssignedPoints      int    `json:"assigned_points"`
	CompletedIssueCount int64  `json:"completed_issue_count"`
	CompletedPoints     int    `json:"completed_points"`
	Capacity            int    `json:"capacity"`
	CapacityPercent     int    `json:"capacity_percent"`
}

type WorkloadTeamEntry struct {
	TeamID         string                `json:"team_id"`
	TeamName       string                `json:"team_name"`
	TeamColor      string                `json:"team_color"`
	TeamIdentifier string                `json:"team_identifier"`
	CycleID        string                `json:"cycle_id"`
	CycleName      string                `json:"cycle_name"`
	CycleNumber    int32                 `json:"cycle_number"`
	CycleStartsAt  string                `json:"cycle_starts_at"`
	CycleEndsAt    string                `json:"cycle_ends_at"`
	Members        []WorkloadMemberEntry `json:"members"`
}

type WorkloadIssueEntry struct {
	ID             string  `json:"id"`
	Identifier     string  `json:"identifier"`
	Title          string  `json:"title"`
	Status         string  `json:"status"`
	Priority       string  `json:"priority"`
	Estimate       *int32  `json:"estimate"`
	TeamID         string  `json:"team_id"`
}

type WorkloadResponse struct {
	Teams []WorkloadTeamEntry `json:"teams"`
}

func (h *Handler) GetWorkload(w http.ResponseWriter, r *http.Request) {
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

	ctx := r.Context()
	wsUUID := parseUUID(wsID)

	rows, err := h.Queries.GetWorkloadByTeam(ctx, wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get workload data")
		return
	}

	// Compute per-member velocity (capacity) from last 3 completed cycles.
	// We cache velocity by (assigneeType, assigneeID, teamID).
	type velKey struct{ aType, aID, teamID string }
	velocityCache := map[velKey]float64{}

	teamMap := map[string]*WorkloadTeamEntry{}
	var teamOrder []string

	for _, row := range rows {
		teamID := uuidToString(row.TeamID)
		if _, exists := teamMap[teamID]; !exists {
			teamMap[teamID] = &WorkloadTeamEntry{
				TeamID:         teamID,
				TeamName:       row.TeamName,
				TeamColor:      row.TeamColor,
				TeamIdentifier: row.TeamIdentifier,
				CycleID:        uuidToString(row.CycleID),
				CycleName:      row.CycleName,
				CycleNumber:    row.CycleNumber,
				CycleStartsAt:  timestampToString(row.CycleStartsAt),
				CycleEndsAt:    timestampToString(row.CycleEndsAt),
				Members:        []WorkloadMemberEntry{},
			}
			teamOrder = append(teamOrder, teamID)
		}

		aType := row.AssigneeType.String
		aID := uuidToString(row.AssigneeID)
		key := velKey{aType, aID, teamID}

		if _, cached := velocityCache[key]; !cached {
			vel := 0.0
			completedCycles, cerr := h.Queries.GetLastCompletedCyclesForTeam(ctx, row.TeamID)
			if cerr == nil && len(completedCycles) > 0 {
				sum := 0.0
				for _, cc := range completedCycles {
					count, _ := extractLastHistoryEntry(cc.CompletedScopeHistory)
					sum += float64(count)
				}
				vel = math.Round(sum / float64(len(completedCycles)))
			}
			if vel == 0 {
				vel = 10 // sensible default when no history
			}
			velocityCache[key] = vel
		}

		capacity := int(velocityCache[key])
		capPct := 0
		if capacity > 0 {
			capPct = int(math.Round(float64(row.AssignedPoints) / float64(capacity) * 100))
		}

		teamMap[teamID].Members = append(teamMap[teamID].Members, WorkloadMemberEntry{
			AssigneeType:        aType,
			AssigneeID:          aID,
			IssueCount:          row.IssueCount,
			AssignedPoints:      int(row.AssignedPoints),
			CompletedIssueCount: row.CompletedIssueCount,
			CompletedPoints:     int(row.CompletedPoints),
			Capacity:            capacity,
			CapacityPercent:     capPct,
		})
	}

	resp := WorkloadResponse{Teams: make([]WorkloadTeamEntry, 0, len(teamOrder))}
	for _, tid := range teamOrder {
		resp.Teams = append(resp.Teams, *teamMap[tid])
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) GetWorkloadIssues(w http.ResponseWriter, r *http.Request) {
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

	assigneeType := r.URL.Query().Get("assignee_type")
	assigneeID := r.URL.Query().Get("assignee_id")
	if assigneeType == "" || assigneeID == "" {
		writeError(w, http.StatusBadRequest, "assignee_type and assignee_id are required")
		return
	}

	issues, err := h.Queries.GetWorkloadIssues(r.Context(), db.GetWorkloadIssuesParams{
		WorkspaceID:  parseUUID(wsID),
		AssigneeType: strToText(assigneeType),
		AssigneeID:   parseUUID(assigneeID),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get workload issues")
		return
	}

	result := make([]WorkloadIssueEntry, len(issues))
	for i, iss := range issues {
		var est *int32
		if iss.Estimate.Valid {
			est = &iss.Estimate.Int32
		}
		result[i] = WorkloadIssueEntry{
			ID:         uuidToString(iss.ID),
			Identifier: iss.TeamIdentifier + "-" + strconv.Itoa(int(iss.Number)),
			Title:      iss.Title,
			Status:     iss.Status,
			Priority:   iss.Priority,
			Estimate:   est,
			TeamID:     uuidToString(iss.TeamID),
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"issues": result})
}
