package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/logger"
	"github.com/multica-ai/multica/server/internal/service"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type TicketResponse struct {
	ID               string  `json:"id"`
	WorkspaceID      string  `json:"workspace_id"`
	ProjectID        string  `json:"project_id"`
	ClientID         string  `json:"client_id"`
	Number           int32   `json:"number"`
	Identifier       string  `json:"identifier"`
	Subject          string  `json:"subject"`
	Description      string  `json:"description"`
	Type             string  `json:"type"`
	Priority         string  `json:"priority"`
	ClientStatus     string  `json:"client_status"`
	InternalStatus   string  `json:"internal_status"`
	AssigneeType     *string `json:"assignee_type"`
	AssigneeID       *string `json:"assignee_id"`
	LinkedIssueID    *string `json:"linked_issue_id"`
	PendingReply     bool    `json:"pending_reply"`
	Source           string  `json:"source"`
	FirstResponseAt  *string `json:"first_response_at"`
	FirstResponseDue *string `json:"first_response_due"`
	NextUpdateDue    *string `json:"next_update_due"`
	ResolutionDue    *string `json:"resolution_due"`
	ResolvedAt       *string `json:"resolved_at"`
	ClosedAt         *string `json:"closed_at"`
	ClientName       string  `json:"client_name"`
	ClientCompany    *string `json:"client_company"`
	ProjectTitle     *string `json:"project_title"`
	CreatedAt        string  `json:"created_at"`
	UpdatedAt        string  `json:"updated_at"`
}

func ticketFromGetRow(t db.GetTicketRow) TicketResponse {
	return TicketResponse{
		ID:               uuidToString(t.ID),
		WorkspaceID:      uuidToString(t.WorkspaceID),
		ProjectID:        uuidToString(t.ProjectID),
		ClientID:         uuidToString(t.ClientID),
		Number:           t.Number,
		Identifier:       fmt.Sprintf("TKT-%04d", t.Number),
		Subject:          t.Subject,
		Description:      t.Description,
		Type:             t.Type,
		Priority:         t.Priority,
		ClientStatus:     t.ClientStatus,
		InternalStatus:   t.InternalStatus,
		AssigneeType:     textToPtr(t.AssigneeType),
		AssigneeID:       uuidToPtr(t.AssigneeID),
		LinkedIssueID:    uuidToPtr(t.LinkedIssueID),
		PendingReply:     t.PendingReply,
		Source:           t.Source,
		FirstResponseAt:  timestampToPtr(t.FirstResponseAt),
		FirstResponseDue: timestampToPtr(t.FirstResponseDue),
		NextUpdateDue:    timestampToPtr(t.NextUpdateDue),
		ResolutionDue:    timestampToPtr(t.ResolutionDue),
		ResolvedAt:       timestampToPtr(t.ResolvedAt),
		ClosedAt:         timestampToPtr(t.ClosedAt),
		ClientName:       t.ClientName,
		ClientCompany:    textToPtr(t.ClientCompany),
		ProjectTitle:     textToPtr(t.ProjectTitle),
		CreatedAt:        timestampToString(t.CreatedAt),
		UpdatedAt:        timestampToString(t.UpdatedAt),
	}
}

func ticketFromListRow(t db.ListTicketsRow) TicketResponse {
	return TicketResponse{
		ID:               uuidToString(t.ID),
		WorkspaceID:      uuidToString(t.WorkspaceID),
		ProjectID:        uuidToString(t.ProjectID),
		ClientID:         uuidToString(t.ClientID),
		Number:           t.Number,
		Identifier:       fmt.Sprintf("TKT-%04d", t.Number),
		Subject:          t.Subject,
		Description:      t.Description,
		Type:             t.Type,
		Priority:         t.Priority,
		ClientStatus:     t.ClientStatus,
		InternalStatus:   t.InternalStatus,
		AssigneeType:     textToPtr(t.AssigneeType),
		AssigneeID:       uuidToPtr(t.AssigneeID),
		LinkedIssueID:    uuidToPtr(t.LinkedIssueID),
		PendingReply:     t.PendingReply,
		Source:           t.Source,
		FirstResponseAt:  timestampToPtr(t.FirstResponseAt),
		FirstResponseDue: timestampToPtr(t.FirstResponseDue),
		NextUpdateDue:    timestampToPtr(t.NextUpdateDue),
		ResolutionDue:    timestampToPtr(t.ResolutionDue),
		ResolvedAt:       timestampToPtr(t.ResolvedAt),
		ClosedAt:         timestampToPtr(t.ClosedAt),
		ClientName:       t.ClientName,
		ClientCompany:    textToPtr(t.ClientCompany),
		ProjectTitle:     textToPtr(t.ProjectTitle),
		CreatedAt:        timestampToString(t.CreatedAt),
		UpdatedAt:        timestampToString(t.UpdatedAt),
	}
}

type CreateTicketRequestBody struct {
	ProjectID   string `json:"project_id"`
	ClientID    string `json:"client_id"`
	Subject     string `json:"subject"`
	Description string `json:"description"`
	Type        string `json:"type"`
	Priority    string `json:"priority"`
	Source      string `json:"source"`
}

type UpdateTicketRequestBody struct {
	Subject        *string `json:"subject"`
	Description    *string `json:"description"`
	Type           *string `json:"type"`
	Priority       *string `json:"priority"`
	InternalStatus *string `json:"internal_status"`
	AssigneeType   *string `json:"assignee_type"`
	AssigneeID     *string `json:"assignee_id"`
	LinkedIssueID  *string `json:"linked_issue_id"`
}

// --- Internal ticket handlers ---

func (h *Handler) ListTickets(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	limit, offset := parsePagination(r)

	tickets, err := h.Queries.ListTickets(r.Context(), db.ListTicketsParams{
		WorkspaceID:    parseUUID(wsID),
		Limit:          limit,
		Offset:         offset,
		InternalStatus: strToNullText(r.URL.Query().Get("status")),
		Priority:       strToNullText(r.URL.Query().Get("priority")),
		ProjectID:      strToNullUUID(r.URL.Query().Get("project_id")),
		AssigneeID:     strToNullUUID(r.URL.Query().Get("assignee_id")),
		ClientID:       strToNullUUID(r.URL.Query().Get("client_id")),
	})
	if err != nil {
		slog.Warn("list tickets failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to list tickets")
		return
	}

	count, _ := h.Queries.CountTickets(r.Context(), db.CountTicketsParams{
		WorkspaceID:    parseUUID(wsID),
		InternalStatus: strToNullText(r.URL.Query().Get("status")),
		Priority:       strToNullText(r.URL.Query().Get("priority")),
		ProjectID:      strToNullUUID(r.URL.Query().Get("project_id")),
		AssigneeID:     strToNullUUID(r.URL.Query().Get("assignee_id")),
		ClientID:       strToNullUUID(r.URL.Query().Get("client_id")),
	})

	resp := make([]TicketResponse, len(tickets))
	for i, t := range tickets {
		resp[i] = ticketFromListRow(t)
	}
	writeJSON(w, http.StatusOK, map[string]any{"tickets": resp, "total": count})
}

func (h *Handler) GetTicket(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ticket, err := h.Queries.GetTicket(r.Context(), parseUUID(id))
	if err != nil {
		writeError(w, http.StatusNotFound, "ticket not found")
		return
	}
	writeJSON(w, http.StatusOK, ticketFromGetRow(ticket))
}

func (h *Handler) CreateTicket(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	var req CreateTicketRequestBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Subject == "" {
		writeError(w, http.StatusBadRequest, "subject is required")
		return
	}
	if req.ClientID == "" {
		writeError(w, http.StatusBadRequest, "client_id is required")
		return
	}
	if req.ProjectID == "" {
		writeError(w, http.StatusBadRequest, "project_id is required")
		return
	}
	if req.Type == "" {
		req.Type = "support"
	}
	if req.Priority == "" {
		req.Priority = "normal"
	}
	if req.Source == "" {
		req.Source = "manual"
	}

	// Compute SLA deadlines from client's SLA policy.
	client, err := h.Queries.GetClient(r.Context(), parseUUID(req.ClientID))
	if err != nil {
		writeError(w, http.StatusBadRequest, "client not found")
		return
	}

	now := time.Now()
	frDue, nuDue, resDue := computeSLADeadlines(r, h, client.SlaPolicyID, req.Priority, now)

	// Increment workspace ticket counter in a transaction.
	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create ticket")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	number, err := qtx.IncrementWorkspaceTicketCounter(r.Context(), parseUUID(wsID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to allocate ticket number")
		return
	}

	ticket, err := qtx.CreateTicket(r.Context(), db.CreateTicketParams{
		WorkspaceID:      parseUUID(wsID),
		ProjectID:        parseUUID(req.ProjectID),
		ClientID:         parseUUID(req.ClientID),
		Number:           number,
		Subject:          req.Subject,
		Description:      req.Description,
		Type:             req.Type,
		Priority:         req.Priority,
		ClientStatus:     "open",
		InternalStatus:   "new",
		Source:           req.Source,
		FirstResponseDue: frDue,
		NextUpdateDue:    nuDue,
		ResolutionDue:    resDue,
	})
	if err != nil {
		slog.Warn("create ticket failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create ticket")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create ticket")
		return
	}

	slog.Info("ticket created", append(logger.RequestAttrs(r), "ticket_id", uuidToString(ticket.ID), "number", number)...)

	// Auto-escalate critical tickets: create issue, add to cycle, notify.
	if req.Priority == "critical" {
		go h.autoEscalateCriticalTicket(context.WithoutCancel(r.Context()), parseUUID(wsID), requestUserID(r), ticket.ID, ticket.Number, req.Subject, ticket.ProjectID)
	}

	// Re-fetch to get joined fields.
	full, err := h.Queries.GetTicket(r.Context(), ticket.ID)
	if err != nil {
		writeJSON(w, http.StatusCreated, map[string]string{"id": uuidToString(ticket.ID)})
		return
	}
	writeJSON(w, http.StatusCreated, ticketFromGetRow(full))
}

func (h *Handler) UpdateTicket(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req UpdateTicketRequestBody
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Derive client_status from internal_status if changed.
	var clientStatus pgtype.Text
	if req.InternalStatus != nil {
		cs := deriveClientStatus(*req.InternalStatus)
		clientStatus = pgtype.Text{String: cs, Valid: true}
	}

	var resolvedAt, closedAt pgtype.Timestamptz
	if req.InternalStatus != nil {
		now := time.Now()
		switch *req.InternalStatus {
		case "resolved":
			resolvedAt = pgtype.Timestamptz{Time: now, Valid: true}
		case "closed":
			closedAt = pgtype.Timestamptz{Time: now, Valid: true}
		}
	}

	ticket, err := h.Queries.UpdateTicket(r.Context(), db.UpdateTicketParams{
		ID:             parseUUID(id),
		Subject:        ptrToNullText(req.Subject),
		Description:    ptrToNullText(req.Description),
		Type:           ptrToNullText(req.Type),
		Priority:       ptrToNullText(req.Priority),
		InternalStatus: ptrToNullText(req.InternalStatus),
		ClientStatus:   clientStatus,
		AssigneeType:   ptrToNullText(req.AssigneeType),
		AssigneeID:     optionalUUID(req.AssigneeID),
		LinkedIssueID:  optionalUUID(req.LinkedIssueID),
		ResolvedAt:     resolvedAt,
		ClosedAt:       closedAt,
	})
	if err != nil {
		slog.Warn("update ticket failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to update ticket")
		return
	}

	full, err := h.Queries.GetTicket(r.Context(), ticket.ID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"id": uuidToString(ticket.ID)})
		return
	}

	// Notify assignee when ticket is assigned to them.
	if req.AssigneeType != nil && req.AssigneeID != nil && *req.AssigneeType == "member" {
		userID := requestUserID(r)
		if *req.AssigneeID != userID {
			details, _ := json.Marshal(map[string]string{"ticket_id": id})
			h.Queries.CreateInboxItem(r.Context(), db.CreateInboxItemParams{
				WorkspaceID:   full.WorkspaceID,
				RecipientType: "member",
				RecipientID:   parseUUID(*req.AssigneeID),
				Type:          "ticket_assigned",
				Severity:      "action_required",
				Title:         fmt.Sprintf("Assigned to you: TKT-%04d %s", full.Number, full.Subject),
				ActorType:     pgtype.Text{String: "member", Valid: true},
				ActorID:       parseUUID(userID),
				Details:       details,
			})
		}
	}

	writeJSON(w, http.StatusOK, ticketFromGetRow(full))
}

func (h *Handler) DeleteTicket(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.Queries.DeleteTicket(r.Context(), parseUUID(id)); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete ticket")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// --- Portal handlers (client-facing) ---

func (h *Handler) CreateTicketFromPortal(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	userID := requestUserID(r)

	client, err := h.Queries.GetClientByUserAndWorkspace(r.Context(), db.GetClientByUserAndWorkspaceParams{
		UserID:      parseUUID(userID),
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "client record not found")
		return
	}

	var req struct {
		ProjectID   string `json:"project_id"`
		Subject     string `json:"subject"`
		Description string `json:"description"`
		Type        string `json:"type"`
		Priority    string `json:"priority"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Subject == "" || req.ProjectID == "" {
		writeError(w, http.StatusBadRequest, "subject and project_id are required")
		return
	}
	if req.Type == "" {
		req.Type = "support"
	}
	if req.Priority == "" {
		req.Priority = "normal"
	}

	// Validate project access.
	projectIDs, _ := h.Queries.ListClientProjectIDs(r.Context(), client.ID)
	projectAllowed := false
	for _, pid := range projectIDs {
		if uuidToString(pid) == req.ProjectID {
			projectAllowed = true
			break
		}
	}
	if !projectAllowed {
		writeError(w, http.StatusForbidden, "you do not have access to this project")
		return
	}

	now := time.Now()
	frDue, nuDue, resDue := computeSLADeadlines(r, h, client.SlaPolicyID, req.Priority, now)

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create ticket")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	number, err := qtx.IncrementWorkspaceTicketCounter(r.Context(), parseUUID(wsID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to allocate ticket number")
		return
	}

	ticket, err := qtx.CreateTicket(r.Context(), db.CreateTicketParams{
		WorkspaceID:      parseUUID(wsID),
		ProjectID:        parseUUID(req.ProjectID),
		ClientID:         client.ID,
		Number:           number,
		Subject:          req.Subject,
		Description:      req.Description,
		Type:             req.Type,
		Priority:         req.Priority,
		ClientStatus:     "open",
		InternalStatus:   "new",
		Source:           "portal",
		FirstResponseDue: frDue,
		NextUpdateDue:    nuDue,
		ResolutionDue:    resDue,
	})
	if err != nil {
		slog.Warn("create portal ticket failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create ticket")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create ticket")
		return
	}

	slog.Info("portal ticket created", append(logger.RequestAttrs(r), "ticket_id", uuidToString(ticket.ID))...)

	// Notify all workspace members about the new ticket.
	go h.notifyNewTicket(r.Context(), parseUUID(wsID), ticket.ID, ticket.Number, req.Subject, client.UserName)

	// Auto-escalate critical tickets: create issue, add to cycle, notify.
	if req.Priority == "critical" {
		go h.autoEscalateCriticalTicket(context.WithoutCancel(r.Context()), parseUUID(wsID), userID, ticket.ID, ticket.Number, req.Subject, ticket.ProjectID)
	}

	full, err := h.Queries.GetTicket(r.Context(), ticket.ID)
	if err != nil {
		writeJSON(w, http.StatusCreated, map[string]string{"id": uuidToString(ticket.ID)})
		return
	}
	writeJSON(w, http.StatusCreated, ticketFromGetRow(full))
}

func (h *Handler) ListTicketsForPortal(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	userID := requestUserID(r)

	client, err := h.Queries.GetClientByUserAndWorkspace(r.Context(), db.GetClientByUserAndWorkspaceParams{
		UserID:      parseUUID(userID),
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "client record not found")
		return
	}

	limit, offset := parsePagination(r)
	tickets, err := h.Queries.ListTicketsForClient(r.Context(), db.ListTicketsForClientParams{
		ClientID: client.ID,
		Limit:    limit,
		Offset:   offset,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list tickets")
		return
	}

	resp := make([]TicketResponse, len(tickets))
	for i, t := range tickets {
		resp[i] = TicketResponse{
			ID:               uuidToString(t.ID),
			WorkspaceID:      uuidToString(t.WorkspaceID),
			ProjectID:        uuidToString(t.ProjectID),
			ClientID:         uuidToString(t.ClientID),
			Number:           t.Number,
			Identifier:       fmt.Sprintf("TKT-%04d", t.Number),
			Subject:          t.Subject,
			Description:      t.Description,
			Type:             t.Type,
			Priority:         t.Priority,
			ClientStatus:     t.ClientStatus,
			InternalStatus:   t.InternalStatus,
			Source:           t.Source,
			FirstResponseDue: timestampToPtr(t.FirstResponseDue),
			ResolutionDue:    timestampToPtr(t.ResolutionDue),
			ProjectTitle:     textToPtr(t.ProjectTitle),
			CreatedAt:        timestampToString(t.CreatedAt),
			UpdatedAt:        timestampToString(t.UpdatedAt),
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"tickets": resp})
}

func (h *Handler) GetTicketForPortal(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	userID := requestUserID(r)
	ticketID := chi.URLParam(r, "id")

	client, err := h.Queries.GetClientByUserAndWorkspace(r.Context(), db.GetClientByUserAndWorkspaceParams{
		UserID:      parseUUID(userID),
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "client record not found")
		return
	}

	ticket, err := h.Queries.GetTicketForClient(r.Context(), db.GetTicketForClientParams{
		ID:       parseUUID(ticketID),
		ClientID: client.ID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "ticket not found")
		return
	}

	writeJSON(w, http.StatusOK, TicketResponse{
		ID:               uuidToString(ticket.ID),
		WorkspaceID:      uuidToString(ticket.WorkspaceID),
		ProjectID:        uuidToString(ticket.ProjectID),
		ClientID:         uuidToString(ticket.ClientID),
		Number:           ticket.Number,
		Identifier:       fmt.Sprintf("TKT-%04d", ticket.Number),
		Subject:          ticket.Subject,
		Description:      ticket.Description,
		Type:             ticket.Type,
		Priority:         ticket.Priority,
		ClientStatus:     ticket.ClientStatus,
		InternalStatus:   ticket.InternalStatus,
		Source:           ticket.Source,
		FirstResponseDue: timestampToPtr(ticket.FirstResponseDue),
		ResolutionDue:    timestampToPtr(ticket.ResolutionDue),
		ProjectTitle:     textToPtr(ticket.ProjectTitle),
		CreatedAt:        timestampToString(ticket.CreatedAt),
		UpdatedAt:        timestampToString(ticket.UpdatedAt),
	})
}

func (h *Handler) ResolveTicketFromPortal(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	userID := requestUserID(r)
	ticketID := chi.URLParam(r, "id")

	client, err := h.Queries.GetClientByUserAndWorkspace(r.Context(), db.GetClientByUserAndWorkspaceParams{
		UserID:      parseUUID(userID),
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "client record not found")
		return
	}

	// Verify ticket belongs to client.
	_, err = h.Queries.GetTicketForClient(r.Context(), db.GetTicketForClientParams{
		ID:       parseUUID(ticketID),
		ClientID: client.ID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "ticket not found")
		return
	}

	now := time.Now()
	_, err = h.Queries.UpdateTicket(r.Context(), db.UpdateTicketParams{
		ID:             parseUUID(ticketID),
		InternalStatus: pgtype.Text{String: "resolved", Valid: true},
		ClientStatus:   pgtype.Text{String: "resolved", Valid: true},
		ResolvedAt:     pgtype.Timestamptz{Time: now, Valid: true},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to resolve ticket")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "resolved"})
}

func (h *Handler) ReopenTicketFromPortal(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	userID := requestUserID(r)
	ticketID := chi.URLParam(r, "id")

	client, err := h.Queries.GetClientByUserAndWorkspace(r.Context(), db.GetClientByUserAndWorkspaceParams{
		UserID:      parseUUID(userID),
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "client record not found")
		return
	}

	_, err = h.Queries.GetTicketForClient(r.Context(), db.GetTicketForClientParams{
		ID:       parseUUID(ticketID),
		ClientID: client.ID,
	})
	if err != nil {
		writeError(w, http.StatusNotFound, "ticket not found")
		return
	}

	_, err = h.Queries.UpdateTicket(r.Context(), db.UpdateTicketParams{
		ID:             parseUUID(ticketID),
		InternalStatus: pgtype.Text{String: "in_progress", Valid: true},
		ClientStatus:   pgtype.Text{String: "open", Valid: true},
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reopen ticket")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "reopened"})
}

// --- SLA Monitor ---

func (h *Handler) GetSLAMonitor(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	breached, _ := h.Queries.ListSLABreachedTickets(r.Context(), parseUUID(wsID))
	atRisk, _ := h.Queries.ListSLAAtRiskTickets(r.Context(), parseUUID(wsID))

	type slaTicket struct {
		ID             string  `json:"id"`
		Number         int32   `json:"number"`
		Identifier     string  `json:"identifier"`
		Subject        string  `json:"subject"`
		Priority       string  `json:"priority"`
		InternalStatus string  `json:"internal_status"`
		ClientName     string  `json:"client_name"`
		ProjectTitle   *string `json:"project_title"`
	}

	mapBreached := make([]slaTicket, len(breached))
	for i, t := range breached {
		mapBreached[i] = slaTicket{
			ID: uuidToString(t.ID), Number: t.Number, Identifier: fmt.Sprintf("TKT-%04d", t.Number),
			Subject: t.Subject, Priority: t.Priority, InternalStatus: t.InternalStatus,
			ClientName: t.ClientName, ProjectTitle: textToPtr(t.ProjectTitle),
		}
	}
	mapAtRisk := make([]slaTicket, len(atRisk))
	for i, t := range atRisk {
		mapAtRisk[i] = slaTicket{
			ID: uuidToString(t.ID), Number: t.Number, Identifier: fmt.Sprintf("TKT-%04d", t.Number),
			Subject: t.Subject, Priority: t.Priority, InternalStatus: t.InternalStatus,
			ClientName: t.ClientName, ProjectTitle: textToPtr(t.ProjectTitle),
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"breached": mapBreached,
		"at_risk":  mapAtRisk,
	})
}

// --- Portal projects ---

func (h *Handler) ListPortalProjects(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	userID := requestUserID(r)

	client, err := h.Queries.GetClientByUserAndWorkspace(r.Context(), db.GetClientByUserAndWorkspaceParams{
		UserID:      parseUUID(userID),
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "client record not found")
		return
	}

	projects, err := h.Queries.ListClientProjects(r.Context(), client.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list projects")
		return
	}
	writeJSON(w, http.StatusOK, projects)
}

// --- Link/create issue ---

func (h *Handler) LinkIssueToTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	var req struct {
		IssueID string `json:"issue_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.IssueID == "" {
		writeError(w, http.StatusBadRequest, "issue_id is required")
		return
	}

	_, err := h.Queries.UpdateTicket(r.Context(), db.UpdateTicketParams{
		ID:            parseUUID(ticketID),
		LinkedIssueID: parseUUID(req.IssueID),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to link issue")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "linked"})
}

func (h *Handler) CreateIssueFromTicket(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	ticket, err := h.Queries.GetTicket(r.Context(), parseUUID(ticketID))
	if err != nil {
		writeError(w, http.StatusNotFound, "ticket not found")
		return
	}

	var req struct {
		TeamID string `json:"team_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.TeamID == "" {
		writeError(w, http.StatusBadRequest, "team_id is required")
		return
	}

	// Create issue using the ticket's subject and description.
	issue, err := h.createIssueForTicket(r, req.TeamID, ticket)
	if err != nil {
		slog.Warn("create issue from ticket failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create issue")
		return
	}

	// Link the issue to the ticket.
	_, _ = h.Queries.UpdateTicket(r.Context(), db.UpdateTicketParams{
		ID:            parseUUID(ticketID),
		LinkedIssueID: issue.ID,
	})

	prefix := h.getTeamIssuePrefix(r.Context(), issue.TeamID)
	resp := issueToResponse(issue, prefix)
	h.enrichSingleWithParent(r.Context(), &resp)
	h.enrichSingleWithMilestone(r.Context(), &resp)
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) createIssueForTicket(r *http.Request, teamID string, ticket db.GetTicketRow) (db.Issue, error) {
	wsID := h.resolveWorkspaceID(r)
	userID := requestUserID(r)

	priority := "none"
	switch ticket.Priority {
	case "critical":
		priority = "urgent"
	case "high":
		priority = "high"
	case "normal":
		priority = "medium"
	case "low":
		priority = "low"
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		return db.Issue{}, err
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	team, err := qtx.GetTeam(r.Context(), parseUUID(teamID))
	if err != nil {
		return db.Issue{}, err
	}

	number, err := qtx.IncrementTeamIssueCounter(r.Context(), team.ID)
	if err != nil {
		return db.Issue{}, err
	}

	issue, err := qtx.CreateIssue(r.Context(), db.CreateIssueParams{
		WorkspaceID: parseUUID(wsID),
		TeamID:      team.ID,
		Number:      number,
		Title:       fmt.Sprintf("[TKT-%04d] %s", ticket.Number, ticket.Subject),
		Description: pgtype.Text{String: ticket.Description, Valid: ticket.Description != ""},
		Status:      "todo",
		Priority:    priority,
		ProjectID:   ticket.ProjectID,
		CreatorType: "member",
		CreatorID:   parseUUID(userID),
	})
	if err != nil {
		return db.Issue{}, err
	}

	if err := tx.Commit(r.Context()); err != nil {
		return db.Issue{}, err
	}
	return issue, nil
}

// --- Helpers ---

func deriveClientStatus(internalStatus string) string {
	switch internalStatus {
	case "new", "triage", "assigned":
		return "open"
	case "in_progress", "waiting_on_internal":
		return "in_progress"
	case "waiting_on_client":
		return "waiting_on_you"
	case "resolved":
		return "resolved"
	case "closed":
		return "closed"
	default:
		return "open"
	}
}

func computeSLADeadlines(r *http.Request, h *Handler, slaPolicyID pgtype.UUID, priority string, now time.Time) (frDue, nuDue, resDue pgtype.Timestamptz) {
	if !slaPolicyID.Valid {
		return
	}
	policy, err := h.Queries.GetSLAPolicy(r.Context(), slaPolicyID)
	if err != nil {
		return
	}

	var fr, nu, res pgtype.Int4
	switch priority {
	case "critical":
		fr, nu, res = policy.CriticalFirstResponse, policy.CriticalUpdateInterval, policy.CriticalResolution
	case "high":
		fr, nu, res = policy.HighFirstResponse, policy.HighUpdateInterval, policy.HighResolution
	case "normal":
		fr, nu, res = policy.NormalFirstResponse, policy.NormalUpdateInterval, policy.NormalResolution
	case "low":
		fr, nu, res = policy.LowFirstResponse, policy.LowUpdateInterval, policy.LowResolution
	}

	if fr.Valid {
		frDue = pgtype.Timestamptz{Time: now.Add(time.Duration(fr.Int32) * time.Minute), Valid: true}
	}
	if nu.Valid {
		nuDue = pgtype.Timestamptz{Time: now.Add(time.Duration(nu.Int32) * time.Minute), Valid: true}
	}
	if res.Valid {
		resDue = pgtype.Timestamptz{Time: now.Add(time.Duration(res.Int32) * time.Minute), Valid: true}
	}
	return
}

func parsePagination(r *http.Request) (int32, int32) {
	limit := int32(100)
	offset := int32(0)
	if l := r.URL.Query().Get("limit"); l != "" {
		if v, err := strconv.Atoi(l); err == nil && v > 0 {
			limit = int32(v)
		}
	}
	if o := r.URL.Query().Get("offset"); o != "" {
		if v, err := strconv.Atoi(o); err == nil && v >= 0 {
			offset = int32(v)
		}
	}
	return limit, offset
}

func strToNullText(s string) pgtype.Text {
	if s == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: s, Valid: true}
}

func strToNullUUID(s string) pgtype.UUID {
	if s == "" {
		return pgtype.UUID{Valid: false}
	}
	return parseUUID(s)
}

func ptrToNullText(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: *s, Valid: true}
}

// autoEscalateCriticalTicket runs as a background goroutine when a critical ticket is created.
// It: 1) creates an issue from the ticket, 2) adds it to the active cycle, 3) sends a Slack alert.
func (h *Handler) autoEscalateCriticalTicket(ctx context.Context, wsID pgtype.UUID, userID string, ticketID pgtype.UUID, ticketNumber int32, subject string, projectID pgtype.UUID) {
	// Find the project's team to determine which cycle to use.
	project, err := h.Queries.GetProject(ctx, projectID)
	if err != nil {
		slog.Warn("autoEscalate: project not found", "error", err, "ticket_id", uuidToString(ticketID))
		return
	}

	// Fetch full ticket for createIssueForTicket.
	ticket, err := h.Queries.GetTicket(ctx, ticketID)
	if err != nil {
		slog.Warn("autoEscalate: ticket not found", "error", err, "ticket_id", uuidToString(ticketID))
		return
	}

	teamID := uuidToString(project.TeamID)

	// 1. Create issue from the ticket.
	priority := "urgent"
	tx, err := h.TxStarter.Begin(ctx)
	if err != nil {
		slog.Warn("autoEscalate: tx begin failed", "error", err)
		return
	}
	defer tx.Rollback(ctx)
	qtx := h.Queries.WithTx(tx)

	team, err := qtx.GetTeam(ctx, parseUUID(teamID))
	if err != nil {
		slog.Warn("autoEscalate: team not found", "error", err, "team_id", teamID)
		return
	}

	number, err := qtx.IncrementTeamIssueCounter(ctx, team.ID)
	if err != nil {
		slog.Warn("autoEscalate: counter increment failed", "error", err)
		return
	}

	issue, err := qtx.CreateIssue(ctx, db.CreateIssueParams{
		WorkspaceID: wsID,
		TeamID:      team.ID,
		Number:      number,
		Title:       fmt.Sprintf("[TKT-%04d] %s", ticketNumber, subject),
		Description: pgtype.Text{String: ticket.Description, Valid: ticket.Description != ""},
		Status:      "todo",
		Priority:    priority,
		ProjectID:   projectID,
		CreatorType: "member",
		CreatorID:   parseUUID(userID),
	})
	if err != nil {
		slog.Warn("autoEscalate: create issue failed", "error", err)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Warn("autoEscalate: commit failed", "error", err)
		return
	}

	// Link the issue to the ticket.
	h.Queries.UpdateTicket(ctx, db.UpdateTicketParams{
		ID:            ticketID,
		LinkedIssueID: issue.ID,
	})

	slog.Info("autoEscalate: issue created from critical ticket",
		"ticket_id", uuidToString(ticketID),
		"issue_id", uuidToString(issue.ID),
	)

	// 2. Add to the active cycle (if one exists).
	cycle, err := h.Queries.GetActiveCycleForTeam(ctx, team.ID)
	if err == nil {
		_, uerr := h.Queries.UpdateIssue(ctx, db.UpdateIssueParams{
			ID:        issue.ID,
			CycleID:   cycle.ID,
			ProjectID: projectID,
			Priority:  pgtype.Text{String: priority, Valid: true},
			Status:    pgtype.Text{String: "todo", Valid: true},
			Title:     pgtype.Text{String: issue.Title, Valid: true},
		})
		if uerr != nil {
			slog.Warn("autoEscalate: failed to add issue to cycle", "error", uerr)
		} else {
			slog.Info("autoEscalate: issue added to active cycle",
				"issue_id", uuidToString(issue.ID),
				"cycle_id", uuidToString(cycle.ID),
			)
		}
	} else {
		slog.Warn("autoEscalate: no active cycle found for team", "team_id", teamID, "error", err)
	}

	// 3. Send Slack notification.
	if h.Slack == nil || !h.Slack.IsConfigured() {
		slog.Warn("autoEscalate: slack not configured, skipping notification")
	}
	if h.Slack != nil && h.Slack.IsConfigured() {
		var settings struct {
			Reports struct {
				SlackChannelID string `json:"slack_channel_id"`
			} `json:"reports"`
		}
		if err := json.Unmarshal(team.Settings, &settings); err != nil {
			slog.Warn("autoEscalate: failed to parse team settings", "error", err)
		} else if settings.Reports.SlackChannelID == "" {
			slog.Warn("autoEscalate: no slack channel configured for team", "team_id", teamID)
		}
		if err := json.Unmarshal(team.Settings, &settings); err == nil && settings.Reports.SlackChannelID != "" {
			prefix := h.getTeamIssuePrefix(ctx, issue.TeamID)
			issueKey := fmt.Sprintf("%s-%d", prefix, issue.Number)

			blocks := []service.SlackBlock{
				{"type": "header", "text": map[string]any{"type": "plain_text", "text": ":rotating_light: Critical Ticket Escalated"}},
				{"type": "section", "fields": []map[string]any{
					{"type": "mrkdwn", "text": fmt.Sprintf("*Ticket:*\nTKT-%04d %s", ticketNumber, subject)},
					{"type": "mrkdwn", "text": fmt.Sprintf("*Issue Created:*\n%s", issueKey)},
					{"type": "mrkdwn", "text": fmt.Sprintf("*Project:*\n%s", project.Title)},
					{"type": "mrkdwn", "text": fmt.Sprintf("*Priority:*\nCritical / Urgent")},
				}},
				{"type": "section", "text": map[string]any{
					"type": "mrkdwn",
					"text": "A critical ticket was automatically escalated to an issue and added to the active cycle. Please review immediately.",
				}},
			}

			if err := h.Slack.PostMessage(settings.Reports.SlackChannelID, blocks); err != nil {
				slog.Warn("autoEscalate: slack post failed", "error", err)
			}
		}
	}

	// 4. Create inbox items for all non-client workspace members.
	members, err := h.Queries.ListMembers(ctx, wsID)
	if err != nil {
		return
	}
	details, _ := json.Marshal(map[string]string{
		"ticket_id": uuidToString(ticketID),
		"issue_id":  uuidToString(issue.ID),
	})
	title := fmt.Sprintf("Critical ticket escalated: TKT-%04d %s", ticketNumber, subject)
	for _, m := range members {
		if m.Role == "client" {
			continue
		}
		h.Queries.CreateInboxItem(ctx, db.CreateInboxItemParams{
			WorkspaceID:   wsID,
			RecipientType: "member",
			RecipientID:   m.ID,
			Type:          "ticket_new",
			Severity:      "action_required",
			Title:         title,
			Details:       details,
		})
	}
}

// notifyNewTicket creates inbox items for all workspace members when a new ticket arrives.
func (h *Handler) notifyNewTicket(ctx context.Context, wsID, ticketID pgtype.UUID, number int32, subject, clientName string) {
	members, err := h.Queries.ListMembers(ctx, wsID)
	if err != nil {
		slog.Warn("notifyNewTicket: failed to list members", "error", err)
		return
	}
	details, _ := json.Marshal(map[string]string{"ticket_id": uuidToString(ticketID)})
	title := fmt.Sprintf("New ticket from %s: TKT-%04d %s", clientName, number, subject)
	for _, m := range members {
		if m.Role == "client" {
			continue
		}
		h.Queries.CreateInboxItem(ctx, db.CreateInboxItemParams{
			WorkspaceID:   wsID,
			RecipientType: "member",
			RecipientID:   m.ID,
			Type:          "ticket_new",
			Severity:      "attention",
			Title:         title,
			Details:       details,
		})
	}
}
