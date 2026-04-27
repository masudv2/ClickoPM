package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

type TeamResponse struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspace_id"`
	Name        string  `json:"name"`
	Identifier  string  `json:"identifier"`
	Icon        *string `json:"icon"`
	Color       string  `json:"color"`
	Timezone    string  `json:"timezone"`
	Settings    any     `json:"settings"`
	Position    float64 `json:"position"`
	CreatedAt   string  `json:"created_at"`
	UpdatedAt   string  `json:"updated_at"`
	IssueCount  int64   `json:"issue_count"`
	MemberCount int64   `json:"member_count"`
}

type TeamMemberResponse struct {
	ID          string  `json:"id"`
	WorkspaceID string  `json:"workspace_id"`
	UserID      string  `json:"user_id"`
	Role        string  `json:"role"`
	CreatedAt   string  `json:"created_at"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	AvatarURL   *string `json:"avatar_url"`
}

func teamToResponse(t db.Team) TeamResponse {
	var settings any
	if len(t.Settings) > 0 {
		_ = json.Unmarshal(t.Settings, &settings)
	}
	if settings == nil {
		settings = map[string]any{}
	}
	return TeamResponse{
		ID:          uuidToString(t.ID),
		WorkspaceID: uuidToString(t.WorkspaceID),
		Name:        t.Name,
		Identifier:  t.Identifier,
		Icon:        textToPtr(t.Icon),
		Color:       t.Color,
		Timezone:    t.Timezone,
		Settings:    settings,
		Position:    float64(t.Position),
		CreatedAt:   timestampToString(t.CreatedAt),
		UpdatedAt:   timestampToString(t.UpdatedAt),
	}
}

func teamMemberToResponse(m db.ListTeamMembersRow) TeamMemberResponse {
	return TeamMemberResponse{
		ID:          uuidToString(m.ID),
		WorkspaceID: uuidToString(m.WorkspaceID),
		UserID:      uuidToString(m.UserID),
		Role:        m.Role,
		CreatedAt:   timestampToString(m.CreatedAt),
		Name:        m.Name,
		Email:       m.Email,
		AvatarURL:   textToPtr(m.AvatarUrl),
	}
}

type CreateTeamRequest struct {
	Name       string  `json:"name"`
	Identifier string  `json:"identifier"`
	Icon       *string `json:"icon"`
	Color      *string `json:"color"`
}

type UpdateTeamRequest struct {
	Name       *string  `json:"name"`
	Identifier *string  `json:"identifier"`
	Icon       *string  `json:"icon"`
	Color      *string  `json:"color"`
	Timezone   *string  `json:"timezone"`
	Settings   any      `json:"settings"`
	Position   *float64 `json:"position"`
}

func (h *Handler) ListTeams(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)

	teams, err := h.Queries.ListTeams(r.Context(), parseUUID(workspaceID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list teams")
		return
	}

	resp := make([]TeamResponse, len(teams))
	for i, t := range teams {
		resp[i] = teamToResponse(t)
		count, err := h.Queries.CountTeamIssues(r.Context(), t.ID)
		if err == nil {
			resp[i].IssueCount = count
		}
		mcount, err := h.Queries.CountTeamMembers(r.Context(), t.ID)
		if err == nil {
			resp[i].MemberCount = mcount
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"teams": resp})
}

func (h *Handler) GetTeam(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	team, err := h.Queries.GetTeam(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "team not found")
		return
	}

	resp := teamToResponse(team)
	count, _ := h.Queries.CountTeamIssues(r.Context(), team.ID)
	resp.IssueCount = count
	mcount, _ := h.Queries.CountTeamMembers(r.Context(), team.ID)
	resp.MemberCount = mcount

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) CreateTeam(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	var req CreateTeamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || req.Identifier == "" {
		writeError(w, http.StatusBadRequest, "name and identifier are required")
		return
	}

	color := "blue"
	if req.Color != nil {
		color = *req.Color
	}

	maxPos, _ := h.Queries.GetMaxTeamPosition(r.Context(), parseUUID(workspaceID))

	team, err := h.Queries.CreateTeam(r.Context(), db.CreateTeamParams{
		WorkspaceID: parseUUID(workspaceID),
		Name:        req.Name,
		Identifier:  req.Identifier,
		Icon:        ptrToText(req.Icon),
		Color:       color,
		Timezone:    "UTC",
		Settings:    []byte("{}"),
		Position:    float32(maxPos + 1),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create team")
		return
	}

	// Auto-add the creator as a team member
	members, _ := h.Queries.ListMembers(r.Context(), parseUUID(workspaceID))
	for _, m := range members {
		if uuidToString(m.UserID) == userID {
			_ = h.Queries.AddTeamMember(r.Context(), db.AddTeamMemberParams{
				TeamID:   team.ID,
				MemberID: m.ID,
			})
			break
		}
	}

	resp := teamToResponse(team)
	resp.MemberCount = 1
	h.publish(protocol.EventTeamCreated, workspaceID, "member", userID, resp)
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) UpdateTeam(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	id := chi.URLParam(r, "id")
	if _, err := h.Queries.GetTeamInWorkspace(r.Context(), db.GetTeamInWorkspaceParams{
		ID: parseUUID(id), WorkspaceID: parseUUID(workspaceID),
	}); err != nil {
		writeError(w, http.StatusNotFound, "team not found")
		return
	}

	var req UpdateTeamRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := db.UpdateTeamParams{ID: parseUUID(id)}
	if req.Name != nil {
		params.Name = pgtype.Text{String: *req.Name, Valid: true}
	}
	if req.Identifier != nil {
		params.Identifier = pgtype.Text{String: *req.Identifier, Valid: true}
	}
	if req.Icon != nil {
		params.Icon = pgtype.Text{String: *req.Icon, Valid: true}
	}
	if req.Color != nil {
		params.Color = pgtype.Text{String: *req.Color, Valid: true}
	}
	if req.Timezone != nil {
		params.Timezone = pgtype.Text{String: *req.Timezone, Valid: true}
	}
	if req.Settings != nil {
		settingsBytes, _ := json.Marshal(req.Settings)
		params.Settings = settingsBytes
	}
	if req.Position != nil {
		params.Position = pgtype.Float4{Float32: float32(*req.Position), Valid: true}
	}

	team, err := h.Queries.UpdateTeam(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update team")
		return
	}

	resp := teamToResponse(team)
	h.publish(protocol.EventTeamUpdated, workspaceID, "member", userID, resp)
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) DeleteTeam(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	id := chi.URLParam(r, "id")
	if _, err := h.Queries.GetTeamInWorkspace(r.Context(), db.GetTeamInWorkspaceParams{
		ID: parseUUID(id), WorkspaceID: parseUUID(workspaceID),
	}); err != nil {
		writeError(w, http.StatusNotFound, "team not found")
		return
	}

	if err := h.Queries.DeleteTeam(r.Context(), parseUUID(id)); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete team")
		return
	}

	h.publish(protocol.EventTeamDeleted, workspaceID, "member", userID, map[string]string{"id": id})
	w.WriteHeader(http.StatusNoContent)
}

// Team Members

func (h *Handler) ListTeamMembers(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	members, err := h.Queries.ListTeamMembers(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list team members")
		return
	}

	resp := make([]TeamMemberResponse, len(members))
	for i, m := range members {
		resp[i] = teamMemberToResponse(m)
	}

	writeJSON(w, http.StatusOK, map[string]any{"members": resp})
}

func (h *Handler) AddTeamMember(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	teamID := chi.URLParam(r, "id")

	var req struct {
		MemberID string `json:"member_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.MemberID == "" {
		writeError(w, http.StatusBadRequest, "member_id is required")
		return
	}

	if err := h.Queries.AddTeamMember(r.Context(), db.AddTeamMemberParams{
		TeamID: parseUUID(teamID), MemberID: parseUUID(req.MemberID),
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add team member")
		return
	}

	h.publish(protocol.EventTeamMemberAdded, workspaceID, "member", userID, map[string]string{
		"team_id": teamID, "member_id": req.MemberID,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) RemoveTeamMember(w http.ResponseWriter, r *http.Request) {
	workspaceID := h.resolveWorkspaceID(r)
	userID, ok := requireUserID(w, r)
	if !ok {
		return
	}

	teamID := chi.URLParam(r, "id")
	memberID := chi.URLParam(r, "memberId")

	if err := h.Queries.RemoveTeamMember(r.Context(), db.RemoveTeamMemberParams{
		TeamID: parseUUID(teamID), MemberID: parseUUID(memberID),
	}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove team member")
		return
	}

	h.publish(protocol.EventTeamMemberRemoved, workspaceID, "member", userID, map[string]string{
		"team_id": teamID, "member_id": memberID,
	})
	w.WriteHeader(http.StatusNoContent)
}
