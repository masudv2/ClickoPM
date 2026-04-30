package handler

import (
	"encoding/json"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

type MilestoneResponse struct {
	ID            string  `json:"id"`
	ProjectID     string  `json:"project_id"`
	Name          string  `json:"name"`
	Description   *string `json:"description"`
	StartDate     *string `json:"start_date"`
	TargetDate    *string `json:"target_date"`
	Position      float64 `json:"position"`
	TotalCount    int64   `json:"total_count"`
	DoneCount     int64   `json:"done_count"`
	StartedCount  int64   `json:"started_count"`
	Percent       int     `json:"percent"`
	DerivedStatus string  `json:"derived_status"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

type CreateMilestoneRequest struct {
	Name        string   `json:"name"`
	Description *string  `json:"description"`
	StartDate   *string  `json:"start_date"`
	TargetDate  *string  `json:"target_date"`
	Position    *float64 `json:"position"`
}

type UpdateMilestoneRequest struct {
	Name        *string  `json:"name"`
	Description *string  `json:"description"`
	StartDate   *string  `json:"start_date"`
	TargetDate  *string  `json:"target_date"`
	Position    *float64 `json:"position"`
}

func milestoneRowToResponse(r db.ListMilestonesByProjectRow) MilestoneResponse {
	resp := MilestoneResponse{
		ID:           uuidToString(r.ID),
		ProjectID:    uuidToString(r.ProjectID),
		Name:         r.Name,
		Description:  textToPtr(r.Description),
		StartDate:    dateToPtr(r.StartDate),
		TargetDate:   dateToPtr(r.TargetDate),
		Position:     r.Position,
		TotalCount:   r.TotalCount,
		DoneCount:    r.DoneCount,
		StartedCount: r.StartedCount,
		CreatedAt:    timestampToString(r.CreatedAt),
		UpdatedAt:    timestampToString(r.UpdatedAt),
	}
	if r.TotalCount > 0 {
		resp.Percent = int(r.DoneCount * 100 / r.TotalCount)
	}
	switch {
	case r.TotalCount > 0 && r.DoneCount == r.TotalCount:
		resp.DerivedStatus = "completed"
	case r.StartedCount > 0 || r.DoneCount > 0:
		resp.DerivedStatus = "in_progress"
	default:
		resp.DerivedStatus = "planned"
	}
	return resp
}

func milestoneToResponse(m db.Milestone) MilestoneResponse {
	return MilestoneResponse{
		ID:            uuidToString(m.ID),
		ProjectID:     uuidToString(m.ProjectID),
		Name:          m.Name,
		Description:   textToPtr(m.Description),
		StartDate:     dateToPtr(m.StartDate),
		TargetDate:    dateToPtr(m.TargetDate),
		Position:      m.Position,
		CreatedAt:     timestampToString(m.CreatedAt),
		UpdatedAt:     timestampToString(m.UpdatedAt),
		DerivedStatus: "planned",
	}
}

func parseDateNullable(s *string) (pgtype.Date, error) {
	if s == nil || *s == "" {
		return pgtype.Date{Valid: false}, nil
	}
	t, err := time.Parse("2006-01-02", *s)
	if err != nil {
		return pgtype.Date{Valid: false}, err
	}
	return pgtype.Date{Time: t, Valid: true}, nil
}

// resolveProjectForMilestone returns the project row when the user has access; writes errors otherwise.
func (h *Handler) resolveProjectForMilestone(w http.ResponseWriter, r *http.Request, projectID string) (db.Project, bool) {
	wsID := h.resolveWorkspaceID(r)
	project, err := h.Queries.GetProjectInWorkspace(r.Context(), db.GetProjectInWorkspaceParams{
		ID:          parseUUID(projectID),
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "project not found")
		return db.Project{}, false
	}
	return project, true
}

func (h *Handler) ListMilestones(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	project, ok := h.resolveProjectForMilestone(w, r, projectID)
	if !ok {
		return
	}
	rows, err := h.Queries.ListMilestonesByProject(r.Context(), project.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list milestones")
		return
	}
	resp := make([]MilestoneResponse, len(rows))
	for i, row := range rows {
		resp[i] = milestoneRowToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"milestones": resp})
}

func (h *Handler) CreateMilestone(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	project, ok := h.resolveProjectForMilestone(w, r, projectID)
	if !ok {
		return
	}
	body, _ := io.ReadAll(r.Body)
	var req CreateMilestoneRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	startDate, err := parseDateNullable(req.StartDate)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid start_date")
		return
	}
	targetDate, err := parseDateNullable(req.TargetDate)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid target_date")
		return
	}
	pos := 0.0
	if req.Position != nil {
		pos = *req.Position
	}
	desc := pgtype.Text{Valid: false}
	if req.Description != nil {
		desc = pgtype.Text{String: *req.Description, Valid: true}
	}
	m, err := h.Queries.CreateMilestone(r.Context(), db.CreateMilestoneParams{
		ProjectID:   project.ID,
		Name:        req.Name,
		Description: desc,
		StartDate:   startDate,
		TargetDate:  targetDate,
		Position:    pos,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create milestone")
		return
	}
	wsID := uuidToString(project.WorkspaceID)
	userID := requestUserID(r)
	actorType, actorID := h.resolveActor(r, userID, wsID)
	resp := milestoneToResponse(m)
	h.publish(protocol.EventMilestoneCreated, wsID, actorType, actorID, map[string]any{"milestone": resp})
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) GetMilestone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	m, err := h.Queries.GetMilestone(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "milestone not found")
		return
	}
	if _, ok := h.resolveProjectForMilestone(w, r, uuidToString(m.ProjectID)); !ok {
		return
	}
	writeJSON(w, http.StatusOK, milestoneToResponse(m))
}

func (h *Handler) UpdateMilestone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	existing, err := h.Queries.GetMilestone(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "milestone not found")
		return
	}
	project, ok := h.resolveProjectForMilestone(w, r, uuidToString(existing.ProjectID))
	if !ok {
		return
	}
	body, _ := io.ReadAll(r.Body)
	var rawFields map[string]json.RawMessage
	json.Unmarshal(body, &rawFields)
	var req UpdateMilestoneRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	params := db.UpdateMilestoneParams{
		ID:          existing.ID,
		Description: existing.Description,
		StartDate:   existing.StartDate,
		TargetDate:  existing.TargetDate,
	}
	if _, ok := rawFields["name"]; ok && req.Name != nil {
		params.Name = pgtype.Text{String: *req.Name, Valid: true}
	}
	if _, ok := rawFields["description"]; ok {
		if req.Description != nil {
			params.Description = pgtype.Text{String: *req.Description, Valid: true}
		} else {
			params.Description = pgtype.Text{Valid: false}
		}
	}
	if _, ok := rawFields["start_date"]; ok {
		sd, err := parseDateNullable(req.StartDate)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid start_date")
			return
		}
		params.StartDate = sd
	}
	if _, ok := rawFields["target_date"]; ok {
		td, err := parseDateNullable(req.TargetDate)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid target_date")
			return
		}
		params.TargetDate = td
	}
	if _, ok := rawFields["position"]; ok && req.Position != nil {
		params.Position = pgtype.Float8{Float64: *req.Position, Valid: true}
	}
	m, err := h.Queries.UpdateMilestone(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update milestone")
		return
	}
	wsID := uuidToString(project.WorkspaceID)
	userID := requestUserID(r)
	actorType, actorID := h.resolveActor(r, userID, wsID)
	resp := milestoneToResponse(m)
	h.publish(protocol.EventMilestoneUpdated, wsID, actorType, actorID, map[string]any{"milestone": resp})
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) DeleteMilestone(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	existing, err := h.Queries.GetMilestone(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "milestone not found")
		return
	}
	project, ok := h.resolveProjectForMilestone(w, r, uuidToString(existing.ProjectID))
	if !ok {
		return
	}
	if err := h.Queries.DeleteMilestone(r.Context(), existing.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete milestone")
		return
	}
	wsID := uuidToString(project.WorkspaceID)
	userID := requestUserID(r)
	actorType, actorID := h.resolveActor(r, userID, wsID)
	h.publish(protocol.EventMilestoneDeleted, wsID, actorType, actorID, map[string]any{
		"milestone_id": id,
		"project_id":   uuidToString(project.ID),
	})
	w.WriteHeader(http.StatusNoContent)
}

type ReorderMilestonesRequest struct {
	IDs       []string  `json:"ids"`
	Positions []float64 `json:"positions"`
}

func (h *Handler) ReorderMilestones(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "id")
	project, ok := h.resolveProjectForMilestone(w, r, projectID)
	if !ok {
		return
	}
	var req ReorderMilestonesRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body")
		return
	}
	if len(req.IDs) != len(req.Positions) || len(req.IDs) == 0 {
		writeError(w, http.StatusBadRequest, "ids and positions length mismatch")
		return
	}
	uuids := make([]pgtype.UUID, len(req.IDs))
	for i, s := range req.IDs {
		uuids[i] = parseUUID(s)
	}
	if err := h.Queries.ReorderMilestones(r.Context(), db.ReorderMilestonesParams{
		Column1: uuids,
		Column2: req.Positions,
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reorder")
		return
	}
	wsID := uuidToString(project.WorkspaceID)
	userID := requestUserID(r)
	actorType, actorID := h.resolveActor(r, userID, wsID)
	h.publish(protocol.EventMilestoneUpdated, wsID, actorType, actorID, map[string]any{
		"project_id": uuidToString(project.ID),
	})
	w.WriteHeader(http.StatusNoContent)
}
