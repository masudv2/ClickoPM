package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/logger"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type SLAPolicyResponse struct {
	ID                     string `json:"id"`
	WorkspaceID            string `json:"workspace_id"`
	Name                   string `json:"name"`
	CriticalFirstResponse  *int32 `json:"critical_first_response"`
	CriticalUpdateInterval *int32 `json:"critical_update_interval"`
	CriticalResolution     *int32 `json:"critical_resolution"`
	HighFirstResponse      *int32 `json:"high_first_response"`
	HighUpdateInterval     *int32 `json:"high_update_interval"`
	HighResolution         *int32 `json:"high_resolution"`
	NormalFirstResponse    *int32 `json:"normal_first_response"`
	NormalUpdateInterval   *int32 `json:"normal_update_interval"`
	NormalResolution       *int32 `json:"normal_resolution"`
	LowFirstResponse       *int32 `json:"low_first_response"`
	LowUpdateInterval      *int32 `json:"low_update_interval"`
	LowResolution          *int32 `json:"low_resolution"`
	SupportHours           string `json:"support_hours"`
	CreatedAt              string `json:"created_at"`
	UpdatedAt              string `json:"updated_at"`
}

func slaPolicyToResponse(p db.SlaPolicy) SLAPolicyResponse {
	return SLAPolicyResponse{
		ID:                     uuidToString(p.ID),
		WorkspaceID:            uuidToString(p.WorkspaceID),
		Name:                   p.Name,
		CriticalFirstResponse:  nullInt32Ptr(p.CriticalFirstResponse),
		CriticalUpdateInterval: nullInt32Ptr(p.CriticalUpdateInterval),
		CriticalResolution:     nullInt32Ptr(p.CriticalResolution),
		HighFirstResponse:      nullInt32Ptr(p.HighFirstResponse),
		HighUpdateInterval:     nullInt32Ptr(p.HighUpdateInterval),
		HighResolution:         nullInt32Ptr(p.HighResolution),
		NormalFirstResponse:    nullInt32Ptr(p.NormalFirstResponse),
		NormalUpdateInterval:   nullInt32Ptr(p.NormalUpdateInterval),
		NormalResolution:       nullInt32Ptr(p.NormalResolution),
		LowFirstResponse:      nullInt32Ptr(p.LowFirstResponse),
		LowUpdateInterval:     nullInt32Ptr(p.LowUpdateInterval),
		LowResolution:         nullInt32Ptr(p.LowResolution),
		SupportHours:           p.SupportHours,
		CreatedAt:              timestampToString(p.CreatedAt),
		UpdatedAt:              timestampToString(p.UpdatedAt),
	}
}

type CreateSLAPolicyRequest struct {
	Name                   string `json:"name"`
	CriticalFirstResponse  *int32 `json:"critical_first_response"`
	CriticalUpdateInterval *int32 `json:"critical_update_interval"`
	CriticalResolution     *int32 `json:"critical_resolution"`
	HighFirstResponse      *int32 `json:"high_first_response"`
	HighUpdateInterval     *int32 `json:"high_update_interval"`
	HighResolution         *int32 `json:"high_resolution"`
	NormalFirstResponse    *int32 `json:"normal_first_response"`
	NormalUpdateInterval   *int32 `json:"normal_update_interval"`
	NormalResolution       *int32 `json:"normal_resolution"`
	LowFirstResponse       *int32 `json:"low_first_response"`
	LowUpdateInterval      *int32 `json:"low_update_interval"`
	LowResolution          *int32 `json:"low_resolution"`
	SupportHours           string `json:"support_hours"`
}

func (h *Handler) ListSLAPolicies(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	policies, err := h.Queries.ListSLAPolicies(r.Context(), parseUUID(wsID))
	if err != nil {
		slog.Warn("list sla policies failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to list SLA policies")
		return
	}
	resp := make([]SLAPolicyResponse, len(policies))
	for i, p := range policies {
		resp[i] = slaPolicyToResponse(p)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) GetSLAPolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	policy, err := h.Queries.GetSLAPolicy(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "SLA policy not found")
		return
	}
	writeJSON(w, http.StatusOK, slaPolicyToResponse(policy))
}

func (h *Handler) CreateSLAPolicy(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	var req CreateSLAPolicyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.SupportHours == "" {
		req.SupportHours = "24/7"
	}

	policy, err := h.Queries.CreateSLAPolicy(r.Context(), db.CreateSLAPolicyParams{
		WorkspaceID:            parseUUID(wsID),
		Name:                   req.Name,
		CriticalFirstResponse:  int32PtrToPgInt4(req.CriticalFirstResponse),
		CriticalUpdateInterval: int32PtrToPgInt4(req.CriticalUpdateInterval),
		CriticalResolution:     int32PtrToPgInt4(req.CriticalResolution),
		HighFirstResponse:      int32PtrToPgInt4(req.HighFirstResponse),
		HighUpdateInterval:     int32PtrToPgInt4(req.HighUpdateInterval),
		HighResolution:         int32PtrToPgInt4(req.HighResolution),
		NormalFirstResponse:    int32PtrToPgInt4(req.NormalFirstResponse),
		NormalUpdateInterval:   int32PtrToPgInt4(req.NormalUpdateInterval),
		NormalResolution:       int32PtrToPgInt4(req.NormalResolution),
		LowFirstResponse:      int32PtrToPgInt4(req.LowFirstResponse),
		LowUpdateInterval:     int32PtrToPgInt4(req.LowUpdateInterval),
		LowResolution:         int32PtrToPgInt4(req.LowResolution),
		SupportHours:           req.SupportHours,
	})
	if err != nil {
		slog.Warn("create sla policy failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create SLA policy")
		return
	}
	writeJSON(w, http.StatusCreated, slaPolicyToResponse(policy))
}

func (h *Handler) UpdateSLAPolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req CreateSLAPolicyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	policy, err := h.Queries.UpdateSLAPolicy(r.Context(), db.UpdateSLAPolicyParams{
		ID:                     parseUUID(id),
		Name:                   pgtype.Text{String: req.Name, Valid: req.Name != ""},
		CriticalFirstResponse:  int32PtrToPgInt4(req.CriticalFirstResponse),
		CriticalUpdateInterval: int32PtrToPgInt4(req.CriticalUpdateInterval),
		CriticalResolution:     int32PtrToPgInt4(req.CriticalResolution),
		HighFirstResponse:      int32PtrToPgInt4(req.HighFirstResponse),
		HighUpdateInterval:     int32PtrToPgInt4(req.HighUpdateInterval),
		HighResolution:         int32PtrToPgInt4(req.HighResolution),
		NormalFirstResponse:    int32PtrToPgInt4(req.NormalFirstResponse),
		NormalUpdateInterval:   int32PtrToPgInt4(req.NormalUpdateInterval),
		NormalResolution:       int32PtrToPgInt4(req.NormalResolution),
		LowFirstResponse:      int32PtrToPgInt4(req.LowFirstResponse),
		LowUpdateInterval:     int32PtrToPgInt4(req.LowUpdateInterval),
		LowResolution:         int32PtrToPgInt4(req.LowResolution),
		SupportHours:           pgtype.Text{String: req.SupportHours, Valid: req.SupportHours != ""},
	})
	if err != nil {
		slog.Warn("update sla policy failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to update SLA policy")
		return
	}
	writeJSON(w, http.StatusOK, slaPolicyToResponse(policy))
}

func (h *Handler) DeleteSLAPolicy(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Queries.DeleteSLAPolicy(r.Context(), parseUUID(id)); err != nil {
		slog.Warn("delete sla policy failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to delete SLA policy")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func int32PtrToPgInt4(v *int32) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{Valid: false}
	}
	return pgtype.Int4{Int32: *v, Valid: true}
}
