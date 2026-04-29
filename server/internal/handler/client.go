package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/logger"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type ClientResponse struct {
	ID            string  `json:"id"`
	WorkspaceID   string  `json:"workspace_id"`
	UserID        string  `json:"user_id"`
	UserName      string  `json:"user_name"`
	UserEmail     string  `json:"user_email"`
	SLAPolicyID   *string `json:"sla_policy_id"`
	SLAPolicyName *string `json:"sla_policy_name"`
	CompanyName   *string `json:"company_name"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

func listClientRowToResponse(c db.ListClientsRow) ClientResponse {
	return ClientResponse{
		ID:            uuidToString(c.ID),
		WorkspaceID:   uuidToString(c.WorkspaceID),
		UserID:        uuidToString(c.UserID),
		UserName:      c.UserName,
		UserEmail:     c.UserEmail,
		SLAPolicyID:   uuidToPtr(c.SlaPolicyID),
		SLAPolicyName: textToPtr(c.SlaPolicyName),
		CompanyName:   textToPtr(c.CompanyName),
		CreatedAt:     timestampToString(c.CreatedAt),
		UpdatedAt:     timestampToString(c.UpdatedAt),
	}
}

func getClientRowToResponse(c db.GetClientRow) ClientResponse {
	return ClientResponse{
		ID:            uuidToString(c.ID),
		WorkspaceID:   uuidToString(c.WorkspaceID),
		UserID:        uuidToString(c.UserID),
		UserName:      c.UserName,
		UserEmail:     c.UserEmail,
		SLAPolicyID:   uuidToPtr(c.SlaPolicyID),
		SLAPolicyName: textToPtr(c.SlaPolicyName),
		CompanyName:   textToPtr(c.CompanyName),
		CreatedAt:     timestampToString(c.CreatedAt),
		UpdatedAt:     timestampToString(c.UpdatedAt),
	}
}

type CreateClientRequest struct {
	Email       string   `json:"email"`
	SLAPolicyID *string  `json:"sla_policy_id"`
	CompanyName *string  `json:"company_name"`
	ProjectIDs  []string `json:"project_ids"`
}

type UpdateClientRequest struct {
	SLAPolicyID *string `json:"sla_policy_id"`
	CompanyName *string `json:"company_name"`
}

func (h *Handler) ListClients(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	clients, err := h.Queries.ListClients(r.Context(), parseUUID(wsID))
	if err != nil {
		slog.Warn("list clients failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to list clients")
		return
	}
	resp := make([]ClientResponse, len(clients))
	for i, c := range clients {
		resp[i] = listClientRowToResponse(c)
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) GetClient(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	client, err := h.Queries.GetClient(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "client not found")
		return
	}
	writeJSON(w, http.StatusOK, getClientRowToResponse(client))
}

// CreateClientWithInvite creates a client record + member (role=client) and sends
// an invitation email via Resend using the existing workspace_invitation flow.
func (h *Handler) CreateClientWithInvite(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	userID := requestUserID(r)

	var req CreateClientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}
	if len(req.ProjectIDs) == 0 {
		writeError(w, http.StatusBadRequest, "at least one project_id is required")
		return
	}

	// Check if user already exists.
	existingUser, err := h.Queries.GetUserByEmail(r.Context(), email)
	if err == nil {
		// Check if already a member.
		_, memberErr := h.Queries.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{
			UserID:      existingUser.ID,
			WorkspaceID: parseUUID(wsID),
		})
		if memberErr == nil {
			writeError(w, http.StatusConflict, "user is already a member")
			return
		}
	}

	// Check for pending invitation.
	_, err = h.Queries.GetPendingInvitationByEmail(r.Context(), db.GetPendingInvitationByEmailParams{
		WorkspaceID:  parseUUID(wsID),
		InviteeEmail: email,
	})
	if err == nil {
		writeError(w, http.StatusConflict, "invitation already pending for this email")
		return
	}

	// Resolve invitee_user_id if user exists.
	var inviteeUserID pgtype.UUID
	if existingUser.ID.Valid {
		inviteeUserID = existingUser.ID
	}

	// Create workspace invitation with role=client (uses Resend email flow).
	requester, err := h.Queries.GetUser(r.Context(), parseUUID(userID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve inviter")
		return
	}

	inv, err := h.Queries.CreateInvitation(r.Context(), db.CreateInvitationParams{
		WorkspaceID:   parseUUID(wsID),
		InviterID:     requester.ID,
		InviteeEmail:  email,
		InviteeUserID: inviteeUserID,
		Role:          "client",
	})
	if err != nil {
		slog.Warn("create client invitation failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create client invitation")
		return
	}

	// Store client metadata (SLA policy, company, projects) for use on acceptance.
	// We create the client record immediately (linked to the user if they exist,
	// or we create a placeholder user).
	var clientUserID pgtype.UUID
	if existingUser.ID.Valid {
		clientUserID = existingUser.ID
	} else {
		newUser, err := h.Queries.CreateUser(r.Context(), db.CreateUserParams{
			Name:  email,
			Email: email,
		})
		if err != nil {
			slog.Warn("create user for client failed", append(logger.RequestAttrs(r), "error", err)...)
			writeError(w, http.StatusInternalServerError, "failed to create client user")
			return
		}
		clientUserID = newUser.ID
	}

	var slaPolicyID pgtype.UUID
	if req.SLAPolicyID != nil {
		slaPolicyID = parseUUID(*req.SLAPolicyID)
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create client")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	client, err := qtx.CreateClient(r.Context(), db.CreateClientParams{
		WorkspaceID: parseUUID(wsID),
		UserID:      clientUserID,
		SlaPolicyID: slaPolicyID,
		CompanyName: ptrToText(req.CompanyName),
	})
	if err != nil {
		slog.Warn("create client failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create client")
		return
	}

	for _, pid := range req.ProjectIDs {
		_ = qtx.AddClientProject(r.Context(), db.AddClientProjectParams{
			ClientID:  client.ID,
			ProjectID: parseUUID(pid),
		})
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create client")
		return
	}

	// Send invitation email via Resend (fire-and-forget).
	var workspaceName string
	if ws, err := h.Queries.GetWorkspace(r.Context(), parseUUID(wsID)); err == nil {
		workspaceName = ws.Name
	}
	if h.EmailService != nil && workspaceName != "" {
		invID := uuidToString(inv.ID)
		inviterName := requester.Name
		go func() {
			if err := h.EmailService.SendInvitationEmail(email, inviterName, workspaceName, invID); err != nil {
				slog.Warn("failed to send client invitation email", "email", email, "error", err)
			}
		}()
	}

	slog.Info("client created with invitation", append(logger.RequestAttrs(r), "client_id", uuidToString(client.ID), "invitation_id", uuidToString(inv.ID))...)
	writeJSON(w, http.StatusCreated, map[string]string{
		"id":            uuidToString(client.ID),
		"invitation_id": uuidToString(inv.ID),
		"status":        "created",
	})
}

func (h *Handler) UpdateClient(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req UpdateClientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	client, err := h.Queries.UpdateClient(r.Context(), db.UpdateClientParams{
		ID:          parseUUID(id),
		SlaPolicyID: optionalUUID(req.SLAPolicyID),
		CompanyName: ptrToText(req.CompanyName),
	})
	if err != nil {
		slog.Warn("update client failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to update client")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"id": uuidToString(client.ID), "status": "updated"})
}

func (h *Handler) DeleteClientRecord(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Queries.DeleteClient(r.Context(), parseUUID(id)); err != nil {
		slog.Warn("delete client failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to delete client")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) ListClientProjects(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	projects, err := h.Queries.ListClientProjects(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list client projects")
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

func (h *Handler) AddClientProject(w http.ResponseWriter, r *http.Request) {
	clientID := chi.URLParam(r, "id")
	projectID := chi.URLParam(r, "projectId")
	err := h.Queries.AddClientProject(r.Context(), db.AddClientProjectParams{
		ClientID:  parseUUID(clientID),
		ProjectID: parseUUID(projectID),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to add project")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) RemoveClientProject(w http.ResponseWriter, r *http.Request) {
	clientID := chi.URLParam(r, "id")
	projectID := chi.URLParam(r, "projectId")
	err := h.Queries.RemoveClientProject(r.Context(), db.RemoveClientProjectParams{
		ClientID:  parseUUID(clientID),
		ProjectID: parseUUID(projectID),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove project")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// InviteTeammateFromPortal lets a client invite a colleague. The new client
// inherits the inviter's company_name, sla_policy_id, and project links.
func (h *Handler) InviteTeammateFromPortal(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	userID := requestUserID(r)

	var body struct {
		Email string `json:"email"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}

	// Look up the invoking client to copy their metadata.
	inviter, err := h.Queries.GetClientByUserAndWorkspace(r.Context(), db.GetClientByUserAndWorkspaceParams{
		UserID:      parseUUID(userID),
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "client record not found")
		return
	}

	projectIDs, err := h.Queries.ListClientProjectIDs(r.Context(), inviter.ID)
	if err != nil || len(projectIDs) == 0 {
		writeError(w, http.StatusBadRequest, "no projects to share")
		return
	}

	pidStrings := make([]string, len(projectIDs))
	for i, pid := range projectIDs {
		pidStrings[i] = uuidToString(pid)
	}

	// Build a synthetic CreateClientRequest and reuse the invite flow.
	req := CreateClientRequest{
		Email:       email,
		SLAPolicyID: uuidToPtr(inviter.SlaPolicyID),
		CompanyName: textToPtr(inviter.CompanyName),
		ProjectIDs:  pidStrings,
	}

	// Inject into request body for CreateClientWithInvite.
	// Instead of re-encoding, just call the shared logic inline.
	// Check for existing member / pending invitation.
	existingUser, err := h.Queries.GetUserByEmail(r.Context(), email)
	if err == nil {
		_, memberErr := h.Queries.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{
			UserID:      existingUser.ID,
			WorkspaceID: parseUUID(wsID),
		})
		if memberErr == nil {
			writeError(w, http.StatusConflict, "user is already a member")
			return
		}
	}

	_, err = h.Queries.GetPendingInvitationByEmail(r.Context(), db.GetPendingInvitationByEmailParams{
		WorkspaceID:  parseUUID(wsID),
		InviteeEmail: email,
	})
	if err == nil {
		writeError(w, http.StatusConflict, "invitation already pending for this email")
		return
	}

	var inviteeUserID pgtype.UUID
	if existingUser.ID.Valid {
		inviteeUserID = existingUser.ID
	}

	requester, err := h.Queries.GetUser(r.Context(), parseUUID(userID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve inviter")
		return
	}

	inv, err := h.Queries.CreateInvitation(r.Context(), db.CreateInvitationParams{
		WorkspaceID:   parseUUID(wsID),
		InviterID:     requester.ID,
		InviteeEmail:  email,
		InviteeUserID: inviteeUserID,
		Role:          "client",
	})
	if err != nil {
		slog.Warn("portal invite failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create invitation")
		return
	}

	var clientUserID pgtype.UUID
	if existingUser.ID.Valid {
		clientUserID = existingUser.ID
	} else {
		newUser, err := h.Queries.CreateUser(r.Context(), db.CreateUserParams{
			Name:  email,
			Email: email,
		})
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create user")
			return
		}
		clientUserID = newUser.ID
	}

	var slaPolicyID pgtype.UUID
	if req.SLAPolicyID != nil {
		slaPolicyID = parseUUID(*req.SLAPolicyID)
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create client")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	client, err := qtx.CreateClient(r.Context(), db.CreateClientParams{
		WorkspaceID: parseUUID(wsID),
		UserID:      clientUserID,
		SlaPolicyID: slaPolicyID,
		CompanyName: ptrToText(req.CompanyName),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create client")
		return
	}

	for _, pid := range req.ProjectIDs {
		_ = qtx.AddClientProject(r.Context(), db.AddClientProjectParams{
			ClientID:  client.ID,
			ProjectID: parseUUID(pid),
		})
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create client")
		return
	}

	// Send invitation email.
	var workspaceName string
	if ws, err := h.Queries.GetWorkspace(r.Context(), parseUUID(wsID)); err == nil {
		workspaceName = ws.Name
	}
	if h.EmailService != nil && workspaceName != "" {
		invID := uuidToString(inv.ID)
		inviterName := requester.Name
		go func() {
			if err := h.EmailService.SendInvitationEmail(email, inviterName, workspaceName, invID); err != nil {
				slog.Warn("failed to send portal teammate invite email", "email", email, "error", err)
			}
		}()
	}

	writeJSON(w, http.StatusCreated, map[string]string{
		"id":            uuidToString(client.ID),
		"invitation_id": uuidToString(inv.ID),
		"status":        "created",
	})
}

func optionalUUID(s *string) pgtype.UUID {
	if s == nil {
		return pgtype.UUID{Valid: false}
	}
	return parseUUID(*s)
}
