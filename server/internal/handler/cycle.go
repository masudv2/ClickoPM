package handler

import (
	"encoding/json"
	"math"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

type CycleResponse struct {
	ID                    string  `json:"id"`
	WorkspaceID           string  `json:"workspace_id"`
	TeamID                string  `json:"team_id"`
	Name                  string  `json:"name"`
	Description           *string `json:"description"`
	Number                int32   `json:"number"`
	Status                string  `json:"status"`
	StartsAt              string  `json:"starts_at"`
	EndsAt                string  `json:"ends_at"`
	CooldownEndsAt        *string `json:"cooldown_ends_at"`
	CompletedAt           *string `json:"completed_at"`
	ScopeHistory          any     `json:"scope_history"`
	CompletedScopeHistory any     `json:"completed_scope_history"`
	StartedScopeHistory   any     `json:"started_scope_history"`
	Position              float64 `json:"position"`
	CreatedAt             string  `json:"created_at"`
	UpdatedAt             string  `json:"updated_at"`
	IssueCount            int64   `json:"issue_count"`
}

type CycleProgressResponse struct {
	CycleResponse
	Scope             ScopeStats           `json:"scope"`
	Started           ScopeStats           `json:"started"`
	Completed         ScopeStats           `json:"completed"`
	Success           int                  `json:"success"`
	Velocity          float64              `json:"velocity"`
	CapacityPercent   float64              `json:"capacity_percent"`
	ScopeCreep        float64              `json:"scope_creep"`
	AssigneeBreakdown []BreakdownItem      `json:"assignee_breakdown"`
	LabelBreakdown    []LabelBreakdownItem `json:"label_breakdown"`
	PriorityBreakdown []BreakdownItem      `json:"priority_breakdown"`
	ProjectBreakdown  []BreakdownItem      `json:"project_breakdown"`
}

type ScopeStats struct {
	Count   int64 `json:"count"`
	Points  int   `json:"points"`
	Percent int   `json:"percent,omitempty"`
}

type BreakdownItem struct {
	ID              string `json:"id,omitempty"`
	ActorType       string `json:"actor_type,omitempty"`
	Name            string `json:"name,omitempty"`
	Priority        string `json:"priority,omitempty"`
	Icon            string `json:"icon,omitempty"`
	TotalCount      int64  `json:"total_count"`
	TotalPoints     int    `json:"total_points"`
	CompletedCount  int64  `json:"completed_count"`
	CompletedPoints int    `json:"completed_points"`
	Percent         int    `json:"percent"`
	Velocity        int    `json:"velocity,omitempty"`
	CapacityPercent int    `json:"capacity_percent,omitempty"`
}

type LabelBreakdownItem struct {
	LabelID         string `json:"label_id"`
	Name            string `json:"name"`
	Color           string `json:"color"`
	TotalCount      int64  `json:"total_count"`
	TotalPoints     int    `json:"total_points"`
	CompletedCount  int64  `json:"completed_count"`
	CompletedPoints int    `json:"completed_points"`
	Percent         int    `json:"percent"`
}

func cycleToResponse(c db.Cycle) CycleResponse {
	var scopeHist, completedHist, startedHist any
	if len(c.ScopeHistory) > 0 {
		_ = json.Unmarshal(c.ScopeHistory, &scopeHist)
	}
	if scopeHist == nil {
		scopeHist = []any{}
	}
	if len(c.CompletedScopeHistory) > 0 {
		_ = json.Unmarshal(c.CompletedScopeHistory, &completedHist)
	}
	if completedHist == nil {
		completedHist = []any{}
	}
	if len(c.StartedScopeHistory) > 0 {
		_ = json.Unmarshal(c.StartedScopeHistory, &startedHist)
	}
	if startedHist == nil {
		startedHist = []any{}
	}

	return CycleResponse{
		ID:                    uuidToString(c.ID),
		WorkspaceID:           uuidToString(c.WorkspaceID),
		TeamID:                uuidToString(c.TeamID),
		Name:                  c.Name,
		Description:           textToPtr(c.Description),
		Number:                c.Number,
		Status:                c.Status,
		StartsAt:              timestampToString(c.StartsAt),
		EndsAt:                timestampToString(c.EndsAt),
		CooldownEndsAt:        timestampToPtr(c.CooldownEndsAt),
		CompletedAt:           timestampToPtr(c.CompletedAt),
		ScopeHistory:          scopeHist,
		CompletedScopeHistory: completedHist,
		StartedScopeHistory:   startedHist,
		Position:              float64(c.Position),
		CreatedAt:             timestampToString(c.CreatedAt),
		UpdatedAt:             timestampToString(c.UpdatedAt),
	}
}

func cyclePct(part, total int64) int {
	if total == 0 {
		return 0
	}
	return int(math.Round(float64(part) / float64(total) * 100))
}

func (h *Handler) ListCycles(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamId")

	cycles, err := h.Queries.ListCycles(r.Context(), parseUUID(teamID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list cycles")
		return
	}

	resp := make([]CycleResponse, len(cycles))
	for i, c := range cycles {
		resp[i] = cycleToResponse(c)
		count, err := h.Queries.CountCycleIssues(r.Context(), c.ID)
		if err == nil {
			resp[i].IssueCount = count
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"cycles": resp})
}

func (h *Handler) GetCycle(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	id := chi.URLParam(r, "id")

	cycle, err := h.Queries.GetCycleInWorkspace(r.Context(), db.GetCycleInWorkspaceParams{
		ID: parseUUID(id), WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "cycle not found")
		return
	}

	resp := cycleToResponse(cycle)
	count, _ := h.Queries.CountCycleIssues(r.Context(), cycle.ID)
	resp.IssueCount = count

	snap, err := h.Queries.GetCycleScopeSnapshot(r.Context(), cycle.ID)
	if err != nil {
		writeJSON(w, http.StatusOK, resp)
		return
	}

	progress := CycleProgressResponse{
		CycleResponse: resp,
		Scope:         ScopeStats{Count: snap.TotalCount, Points: int(snap.TotalPoints)},
		Started:       ScopeStats{Count: snap.StartedCount, Points: int(snap.StartedPoints), Percent: cyclePct(snap.StartedCount, snap.TotalCount)},
		Completed:     ScopeStats{Count: snap.CompletedCount, Points: int(snap.CompletedPoints), Percent: cyclePct(snap.CompletedCount, snap.TotalCount)},
	}

	if snap.TotalCount > 0 {
		progress.Success = int(math.Round((float64(snap.CompletedCount)*100 + float64(snap.StartedCount)*25) / float64(snap.TotalCount)))
	}

	// Velocity from last 3 completed cycles
	if completedCycles, err := h.Queries.GetLastCompletedCyclesForTeam(r.Context(), cycle.TeamID); err == nil && len(completedCycles) > 0 {
		sum := 0.0
		for _, cc := range completedCycles {
			count, _ := extractLastHistoryEntry(cc.CompletedScopeHistory)
			sum += float64(count)
		}
		progress.Velocity = math.Round(sum/float64(len(completedCycles))*10) / 10
		if progress.Velocity > 0 {
			progress.CapacityPercent = math.Round(float64(snap.TotalCount) / progress.Velocity * 100)
		}
	}

	// Scope creep from first scope_history entry
	if cycle.ScopeHistory != nil {
		var entries []struct {
			Count int `json:"count"`
		}
		if err := json.Unmarshal(cycle.ScopeHistory, &entries); err == nil && len(entries) > 0 {
			startScope := entries[0].Count
			currentScope := int(snap.TotalCount)
			if currentScope > 0 && startScope > 0 {
				progress.ScopeCreep = math.Round(float64(currentScope-startScope) / float64(currentScope) * 100)
			}
		}
	}

	// Fetch per-assignee historical completed points for velocity.
	type velKey struct{ aType, aID string }
	assigneeVelocity := map[velKey]int{}

	if histRows, herr := h.Queries.GetAssigneePointsForCompletedCycles(r.Context(), cycle.TeamID); herr == nil {
		completedCycles, _ := h.Queries.GetLastCompletedCyclesForTeam(r.Context(), cycle.TeamID)
		numCycles := len(completedCycles)
		if numCycles == 0 {
			numCycles = 1
		}
		for _, hr := range histRows {
			key := velKey{hr.AssigneeType.String, uuidToString(hr.AssigneeID)}
			assigneeVelocity[key] = int(math.Round(float64(hr.CompletedPoints) / float64(numCycles)))
		}
	}

	if assignees, err := h.Queries.GetCycleAssigneeBreakdown(r.Context(), cycle.ID); err == nil {
		progress.AssigneeBreakdown = make([]BreakdownItem, len(assignees))
		for i, a := range assignees {
			name := ""
			if s, ok := a.AssigneeName.(string); ok {
				name = s
			}
			aID := uuidToString(a.AssigneeID)
			vel := assigneeVelocity[velKey{a.AssigneeType.String, aID}]
			if vel == 0 {
				vel = 25
			}
			capPct := 0
			if vel > 0 {
				capPct = int(math.Round(float64(a.TotalPoints) / float64(vel) * 100))
			}
			progress.AssigneeBreakdown[i] = BreakdownItem{
				ID: aID, ActorType: a.AssigneeType.String, Name: name,
				TotalCount: a.TotalCount, TotalPoints: int(a.TotalPoints),
				CompletedCount: a.CompletedCount, CompletedPoints: int(a.CompletedPoints),
				Percent:         cyclePct(a.CompletedCount, a.TotalCount),
				Velocity:        vel,
				CapacityPercent: capPct,
			}
		}
	}
	// Add team members who have no issues in this cycle so the UI can show everyone.
	if teamMembers, tmErr := h.Queries.ListTeamMembers(r.Context(), cycle.TeamID); tmErr == nil {
		existing := map[string]bool{}
		for _, b := range progress.AssigneeBreakdown {
			existing[b.ID] = true
		}
		for _, tm := range teamMembers {
			uid := uuidToString(tm.UserID)
			if existing[uid] {
				continue
			}
			vel := assigneeVelocity[velKey{"member", uid}]
			if vel == 0 {
				vel = 25
			}
			progress.AssigneeBreakdown = append(progress.AssigneeBreakdown, BreakdownItem{
				ID: uid, ActorType: "member", Name: tm.Name,
				TotalCount: 0, TotalPoints: 0,
				CompletedCount: 0, CompletedPoints: 0,
				Percent: 0, Velocity: vel, CapacityPercent: 0,
			})
		}
	}
	if progress.AssigneeBreakdown == nil {
		progress.AssigneeBreakdown = []BreakdownItem{}
	}

	if labels, err := h.Queries.GetCycleLabelBreakdown(r.Context(), cycle.ID); err == nil {
		progress.LabelBreakdown = make([]LabelBreakdownItem, len(labels))
		for i, l := range labels {
			progress.LabelBreakdown[i] = LabelBreakdownItem{
				LabelID: uuidToString(l.LabelID), Name: l.LabelName, Color: l.LabelColor,
				TotalCount: l.TotalCount, TotalPoints: int(l.TotalPoints),
				CompletedCount: l.CompletedCount, CompletedPoints: int(l.CompletedPoints),
				Percent: cyclePct(l.CompletedCount, l.TotalCount),
			}
		}
	}
	if progress.LabelBreakdown == nil {
		progress.LabelBreakdown = []LabelBreakdownItem{}
	}

	if priorities, err := h.Queries.GetCyclePriorityBreakdown(r.Context(), cycle.ID); err == nil {
		progress.PriorityBreakdown = make([]BreakdownItem, len(priorities))
		for i, p := range priorities {
			progress.PriorityBreakdown[i] = BreakdownItem{
				Priority:    p.Priority,
				TotalCount:  p.TotalCount, TotalPoints: int(p.TotalPoints),
				CompletedCount: p.CompletedCount, CompletedPoints: int(p.CompletedPoints),
				Percent: cyclePct(p.CompletedCount, p.TotalCount),
			}
		}
	}
	if progress.PriorityBreakdown == nil {
		progress.PriorityBreakdown = []BreakdownItem{}
	}

	if projects, err := h.Queries.GetCycleProjectBreakdown(r.Context(), cycle.ID); err == nil {
		progress.ProjectBreakdown = make([]BreakdownItem, len(projects))
		for i, p := range projects {
			icon := ""
			if ptr := textToPtr(p.ProjectIcon); ptr != nil {
				icon = *ptr
			}
			progress.ProjectBreakdown[i] = BreakdownItem{
				ID: uuidToString(p.ProjectID), Name: p.ProjectTitle, Icon: icon,
				TotalCount: p.TotalCount, TotalPoints: int(p.TotalPoints),
				CompletedCount: p.CompletedCount, CompletedPoints: int(p.CompletedPoints),
				Percent: cyclePct(p.CompletedCount, p.TotalCount),
			}
		}
	}
	if progress.ProjectBreakdown == nil {
		progress.ProjectBreakdown = []BreakdownItem{}
	}

	writeJSON(w, http.StatusOK, progress)
}

func (h *Handler) ListCycleIssues(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	id := chi.URLParam(r, "id")

	cycle, err := h.Queries.GetCycleInWorkspace(r.Context(), db.GetCycleInWorkspaceParams{
		ID: parseUUID(id), WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "cycle not found")
		return
	}

	issues, err := h.Queries.ListIssuesByCycle(r.Context(), cycle.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list cycle issues")
		return
	}

	prefixMap := h.teamPrefixMap(r.Context(), cycle.WorkspaceID)
	resp := make([]IssueResponse, len(issues))
	for i, iss := range issues {
		resp[i] = issueToResponse(iss, prefixMap[uuidToString(iss.TeamID)])
	}
	writeJSON(w, http.StatusOK, map[string]any{"issues": resp})
}

func (h *Handler) GetActiveCycle(w http.ResponseWriter, r *http.Request) {
	teamID := chi.URLParam(r, "teamId")

	cycle, err := h.Queries.GetActiveCycleForTeam(r.Context(), parseUUID(teamID))
	if err != nil {
		writeError(w, http.StatusNotFound, "no active cycle")
		return
	}

	resp := cycleToResponse(cycle)
	count, _ := h.Queries.CountCycleIssues(r.Context(), cycle.ID)
	resp.IssueCount = count
	writeJSON(w, http.StatusOK, resp)
}

type CreateCycleRequest struct {
	Name        string  `json:"name"`
	Description *string `json:"description"`
	StartsAt    string  `json:"starts_at"`
	EndsAt      string  `json:"ends_at"`
}

func (h *Handler) CreateCycle(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	teamID := chi.URLParam(r, "teamId")

	var req CreateCycleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || req.StartsAt == "" || req.EndsAt == "" {
		writeError(w, http.StatusBadRequest, "name, starts_at, and ends_at are required")
		return
	}

	startsAt, err := time.Parse(time.RFC3339, req.StartsAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid starts_at format")
		return
	}
	endsAt, err := time.Parse(time.RFC3339, req.EndsAt)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid ends_at format")
		return
	}

	maxNum, _ := h.Queries.GetMaxCycleNumber(r.Context(), parseUUID(teamID))
	maxPos, _ := h.Queries.GetMaxCyclePosition(r.Context(), parseUUID(teamID))

	cycle, err := h.Queries.CreateCycle(r.Context(), db.CreateCycleParams{
		WorkspaceID: parseUUID(workspaceID),
		TeamID:      parseUUID(teamID),
		Name:        req.Name,
		Description: ptrToText(req.Description),
		Number:      maxNum + 1,
		Status:      "planned",
		StartsAt:    pgtype.Timestamptz{Time: startsAt, Valid: true},
		EndsAt:      pgtype.Timestamptz{Time: endsAt, Valid: true},
		Position:    float32(maxPos + 1),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create cycle")
		return
	}

	resp := cycleToResponse(cycle)
	h.publish(protocol.EventCycleCreated, workspaceID, "member", userID, resp)
	writeJSON(w, http.StatusCreated, resp)
}

type UpdateCycleRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	StartsAt    *string `json:"starts_at"`
	EndsAt      *string `json:"ends_at"`
}

func (h *Handler) UpdateCycle(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	if _, err := h.Queries.GetCycleInWorkspace(r.Context(), db.GetCycleInWorkspaceParams{
		ID: parseUUID(id), WorkspaceID: parseUUID(workspaceID),
	}); err != nil {
		writeError(w, http.StatusNotFound, "cycle not found")
		return
	}

	var req UpdateCycleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := db.UpdateCycleParams{ID: parseUUID(id)}
	if req.Name != nil {
		params.Name = pgtype.Text{String: *req.Name, Valid: true}
	}
	if req.Description != nil {
		params.Description = pgtype.Text{String: *req.Description, Valid: true}
	}
	if req.StartsAt != nil {
		t, err := time.Parse(time.RFC3339, *req.StartsAt)
		if err == nil {
			params.StartsAt = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}
	if req.EndsAt != nil {
		t, err := time.Parse(time.RFC3339, *req.EndsAt)
		if err == nil {
			params.EndsAt = pgtype.Timestamptz{Time: t, Valid: true}
		}
	}

	cycle, err := h.Queries.UpdateCycle(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update cycle")
		return
	}

	resp := cycleToResponse(cycle)
	h.publish(protocol.EventCycleUpdated, workspaceID, "member", userID, resp)
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) DeleteCycle(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	if _, err := h.Queries.GetCycleInWorkspace(r.Context(), db.GetCycleInWorkspaceParams{
		ID: parseUUID(id), WorkspaceID: parseUUID(workspaceID),
	}); err != nil {
		writeError(w, http.StatusNotFound, "cycle not found")
		return
	}

	if err := h.Queries.DeleteCycle(r.Context(), parseUUID(id)); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete cycle")
		return
	}

	h.publish(protocol.EventCycleDeleted, workspaceID, "member", userID, map[string]string{"id": id})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) StartCycle(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	cycle, err := h.Queries.GetCycleInWorkspace(r.Context(), db.GetCycleInWorkspaceParams{
		ID: parseUUID(id), WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "cycle not found")
		return
	}
	if cycle.Status != "planned" {
		writeError(w, http.StatusBadRequest, "only planned cycles can be started")
		return
	}

	updated, err := h.Queries.UpdateCycle(r.Context(), db.UpdateCycleParams{
		ID:     parseUUID(id),
		Status: pgtype.Text{String: "active", Valid: true},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start cycle")
		return
	}

	resp := cycleToResponse(updated)
	h.publish(protocol.EventCycleStarted, workspaceID, "member", userID, resp)
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) CompleteCycle(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}
	id := chi.URLParam(r, "id")

	cycle, err := h.Queries.GetCycleInWorkspace(r.Context(), db.GetCycleInWorkspaceParams{
		ID: parseUUID(id), WorkspaceID: parseUUID(workspaceID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "cycle not found")
		return
	}
	if cycle.Status != "active" && cycle.Status != "cooldown" {
		writeError(w, http.StatusBadRequest, "only active or cooldown cycles can be completed")
		return
	}

	now := time.Now()
	updated, err := h.Queries.UpdateCycle(r.Context(), db.UpdateCycleParams{
		ID:          parseUUID(id),
		Status:      pgtype.Text{String: "completed", Valid: true},
		CompletedAt: pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to complete cycle")
		return
	}

	// Move unfinished issues to next planned cycle
	nextCycles, _ := h.Queries.ListCyclesByStatus(r.Context(), db.ListCyclesByStatusParams{
		TeamID: cycle.TeamID, Status: "planned",
	})
	if len(nextCycles) > 0 {
		_ = h.Queries.MoveUnfinishedIssuesToCycle(r.Context(), db.MoveUnfinishedIssuesToCycleParams{
			CycleID:   cycle.ID,
			CycleID_2: nextCycles[0].ID,
		})
	}

	resp := cycleToResponse(updated)
	h.publish(protocol.EventCycleCompleted, workspaceID, "member", userID, resp)
	writeJSON(w, http.StatusOK, resp)
}
