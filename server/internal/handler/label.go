package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"

	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

type LabelResponse struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspace_id"`
	Name        string  `json:"name"`
	Color       string  `json:"color"`
	Position    float64 `json:"position"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
}

type CreateLabelRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

type UpdateLabelRequest struct {
	Name     *string  `json:"name"`
	Color    *string  `json:"color"`
	Position *float64 `json:"position"`
}

type SetIssueLabelsRequest struct {
	LabelIDs []string `json:"label_ids"`
}

func labelToResponse(row db.Label) LabelResponse {
	return LabelResponse{
		ID:          uuidToString(row.ID),
		WorkspaceID: uuidToString(row.WorkspaceID),
		Name:        row.Name,
		Color:       row.Color,
		Position:    float64(row.Position),
		CreatedAt:   timestampToString(row.CreatedAt),
		UpdatedAt:   timestampToString(row.UpdatedAt),
	}
}

func (h *Handler) ListLabels(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	rows, err := h.Queries.ListLabels(r.Context(), parseUUID(workspaceID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list labels")
		return
	}
	labels := make([]LabelResponse, len(rows))
	for i, row := range rows {
		labels[i] = labelToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"labels": labels})
}

func (h *Handler) CreateLabel(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	var req CreateLabelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.Color == "" {
		req.Color = "gray"
	}

	maxPos, err := h.Queries.GetMaxLabelPosition(r.Context(), parseUUID(workspaceID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get position")
		return
	}

	row, err := h.Queries.CreateLabel(r.Context(), db.CreateLabelParams{
		WorkspaceID: parseUUID(workspaceID),
		Name:        req.Name,
		Color:       req.Color,
		Position:    maxPos + 1,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create label")
		return
	}

	resp := labelToResponse(row)
	h.publish(protocol.EventLabelCreated, workspaceID, "member", userID, map[string]any{"label": resp})
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) UpdateLabel(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	id := chi.URLParam(r, "id")
	if _, err := h.Queries.GetLabelInWorkspace(r.Context(), db.GetLabelInWorkspaceParams{
		ID: parseUUID(id), WorkspaceID: parseUUID(workspaceID),
	}); err != nil {
		writeError(w, http.StatusNotFound, "label not found")
		return
	}

	var req UpdateLabelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := db.UpdateLabelParams{ID: parseUUID(id)}
	if req.Name != nil {
		params.Name = pgtype.Text{String: *req.Name, Valid: true}
	}
	if req.Color != nil {
		params.Color = pgtype.Text{String: *req.Color, Valid: true}
	}
	if req.Position != nil {
		params.Position = pgtype.Float4{Float32: float32(*req.Position), Valid: true}
	}

	row, err := h.Queries.UpdateLabel(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update label")
		return
	}

	resp := labelToResponse(row)
	h.publish(protocol.EventLabelUpdated, workspaceID, "member", userID, map[string]any{"label": resp})
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) DeleteLabel(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	id := chi.URLParam(r, "id")
	if _, err := h.Queries.GetLabelInWorkspace(r.Context(), db.GetLabelInWorkspaceParams{
		ID: parseUUID(id), WorkspaceID: parseUUID(workspaceID),
	}); err != nil {
		writeError(w, http.StatusNotFound, "label not found")
		return
	}

	if err := h.Queries.DeleteLabel(r.Context(), parseUUID(id)); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete label")
		return
	}

	h.publish(protocol.EventLabelDeleted, workspaceID, "member", userID, map[string]any{"label_id": id})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListIssueLabels(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	rows, err := h.Queries.ListIssueLabels(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list issue labels")
		return
	}
	labels := make([]LabelResponse, len(rows))
	for i, row := range rows {
		labels[i] = labelToResponse(row)
	}
	writeJSON(w, http.StatusOK, map[string]any{"labels": labels})
}

func (h *Handler) SetIssueLabels(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	issueID := chi.URLParam(r, "id")

	var req SetIssueLabelsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Clear existing labels
	if err := h.Queries.SetIssueLabels(r.Context(), parseUUID(issueID)); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to clear labels")
		return
	}

	// Add new labels
	for _, lid := range req.LabelIDs {
		_ = h.Queries.AddIssueLabel(r.Context(), db.AddIssueLabelParams{
			IssueID: parseUUID(issueID),
			LabelID: parseUUID(lid),
		})
	}

	// Fetch updated labels for response
	rows, err := h.Queries.ListIssueLabels(r.Context(), parseUUID(issueID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list issue labels")
		return
	}
	labels := make([]LabelResponse, len(rows))
	for i, row := range rows {
		labels[i] = labelToResponse(row)
	}

	h.publish(protocol.EventIssueUpdated, workspaceID, "member", userID, map[string]any{
		"id":     issueID,
		"labels": labels,
	})
	writeJSON(w, http.StatusOK, map[string]any{"labels": labels})
}
