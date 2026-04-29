package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/multica-ai/multica/server/internal/logger"
	db "github.com/multica-ai/multica/server/pkg/db/generated"
)

type TicketMessageResponse struct {
	ID         string  `json:"id"`
	TicketID   string  `json:"ticket_id"`
	Type       string  `json:"type"`
	Body       string  `json:"body"`
	SenderType string  `json:"sender_type"`
	SenderID   string  `json:"sender_id"`
	SenderName *string `json:"sender_name"`
	CreatedAt  string  `json:"created_at"`
}

func ticketMessageToResponse(m db.ListTicketMessagesRow) TicketMessageResponse {
	return TicketMessageResponse{
		ID:         uuidToString(m.ID),
		TicketID:   uuidToString(m.TicketID),
		Type:       m.Type,
		Body:       m.Body,
		SenderType: m.SenderType,
		SenderID:   uuidToString(m.SenderID),
		SenderName: textToPtr(m.SenderName),
		CreatedAt:  timestampToString(m.CreatedAt),
	}
}

func ticketReplyToResponse(m db.ListTicketRepliesRow) TicketMessageResponse {
	return TicketMessageResponse{
		ID:         uuidToString(m.ID),
		TicketID:   uuidToString(m.TicketID),
		Type:       m.Type,
		Body:       m.Body,
		SenderType: m.SenderType,
		SenderID:   uuidToString(m.SenderID),
		SenderName: textToPtr(m.SenderName),
		CreatedAt:  timestampToString(m.CreatedAt),
	}
}

type CreateTicketMessageRequest struct {
	Body string `json:"body"`
}

func (h *Handler) ListTicketMessages(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	messages, err := h.Queries.ListTicketMessages(r.Context(), parseUUID(ticketID))
	if err != nil {
		slog.Warn("list ticket messages failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to list messages")
		return
	}
	resp := make([]TicketMessageResponse, len(messages))
	for i, m := range messages {
		resp[i] = ticketMessageToResponse(m)
	}
	writeJSON(w, http.StatusOK, resp)
}

// CreateTicketReply creates a team reply on a ticket. Tracks first response time,
// resets pending_reply flag, and sends an email notification to the client.
func (h *Handler) CreateTicketReply(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	userID := requestUserID(r)

	var req CreateTicketMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Body == "" {
		writeError(w, http.StatusBadRequest, "body is required")
		return
	}

	msg, err := h.Queries.CreateTicketMessage(r.Context(), db.CreateTicketMessageParams{
		TicketID:   parseUUID(ticketID),
		Type:       "reply",
		Body:       req.Body,
		SenderType: "member",
		SenderID:   parseUUID(userID),
	})
	if err != nil {
		slog.Warn("create ticket reply failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create reply")
		return
	}

	// Track first response and reset pending_reply.
	now := time.Now()
	updateParams := db.UpdateTicketParams{
		ID:           parseUUID(ticketID),
		PendingReply: pgtype.Bool{Bool: false, Valid: true},
	}

	count, _ := h.Queries.CountTeamRepliesForTicket(r.Context(), parseUUID(ticketID))
	if count == 1 {
		updateParams.FirstResponseAt = pgtype.Timestamptz{Time: now, Valid: true}
	}

	_, _ = h.Queries.UpdateTicket(r.Context(), updateParams)

	// Send email notification to client (fire-and-forget).
	if h.EmailService != nil {
		ticket, err := h.Queries.GetTicket(r.Context(), parseUUID(ticketID))
		if err == nil {
			clientUser, err := h.Queries.GetUser(r.Context(), ticket.ClientID)
			if err == nil {
				sender, _ := h.Queries.GetUser(r.Context(), parseUUID(userID))
				senderName := "Support"
				if sender.Name != "" {
					senderName = sender.Name
				}
				go func() {
					subject := "Re: " + ticket.Subject
					if err := h.EmailService.SendTicketNotification(clientUser.Email, senderName, subject, req.Body); err != nil {
						slog.Warn("failed to send ticket reply email", "error", err)
					}
				}()
			}
		}
	}

	// No inbox item for team replies — the team member wrote it themselves.

	writeJSON(w, http.StatusCreated, TicketMessageResponse{
		ID:         uuidToString(msg.ID),
		TicketID:   uuidToString(msg.TicketID),
		Type:       msg.Type,
		Body:       msg.Body,
		SenderType: msg.SenderType,
		SenderID:   uuidToString(msg.SenderID),
		CreatedAt:  timestampToString(msg.CreatedAt),
	})
}

// CreateTicketNote creates an internal note (not visible to client).
func (h *Handler) CreateTicketNote(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	userID := requestUserID(r)

	var req CreateTicketMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Body == "" {
		writeError(w, http.StatusBadRequest, "body is required")
		return
	}

	msg, err := h.Queries.CreateTicketMessage(r.Context(), db.CreateTicketMessageParams{
		TicketID:   parseUUID(ticketID),
		Type:       "note",
		Body:       req.Body,
		SenderType: "member",
		SenderID:   parseUUID(userID),
	})
	if err != nil {
		slog.Warn("create ticket note failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create note")
		return
	}

	writeJSON(w, http.StatusCreated, TicketMessageResponse{
		ID:         uuidToString(msg.ID),
		TicketID:   uuidToString(msg.TicketID),
		Type:       msg.Type,
		Body:       msg.Body,
		SenderType: msg.SenderType,
		SenderID:   uuidToString(msg.SenderID),
		CreatedAt:  timestampToString(msg.CreatedAt),
	})
}

// --- Portal handlers (client-facing) ---

// CreateTicketReplyFromPortal creates a client reply on a ticket.
// Sets pending_reply=true so the team knows action is needed.
func (h *Handler) CreateTicketReplyFromPortal(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	userID := requestUserID(r)

	var req CreateTicketMessageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Body == "" {
		writeError(w, http.StatusBadRequest, "body is required")
		return
	}

	// Verify client owns this ticket.
	wsID := h.resolveWorkspaceID(r)
	client, err := h.Queries.GetClientByUserAndWorkspace(r.Context(), db.GetClientByUserAndWorkspaceParams{
		UserID:      parseUUID(userID),
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "client not found")
		return
	}

	ticket, err := h.Queries.GetTicket(r.Context(), parseUUID(ticketID))
	if err != nil {
		writeError(w, http.StatusNotFound, "ticket not found")
		return
	}
	if uuidToString(ticket.ClientID) != uuidToString(client.ID) {
		writeError(w, http.StatusForbidden, "not your ticket")
		return
	}

	msg, err := h.Queries.CreateTicketMessage(r.Context(), db.CreateTicketMessageParams{
		TicketID:   parseUUID(ticketID),
		Type:       "reply",
		Body:       req.Body,
		SenderType: "client",
		SenderID:   parseUUID(userID),
	})
	if err != nil {
		slog.Warn("create portal reply failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create reply")
		return
	}

	// Set pending_reply so team sees action is needed.
	_, _ = h.Queries.UpdateTicket(r.Context(), db.UpdateTicketParams{
		ID:           parseUUID(ticketID),
		PendingReply: pgtype.Bool{Bool: true, Valid: true},
	})

	// Email the assigned team member (fire-and-forget).
	if h.EmailService != nil && ticket.AssigneeID.Valid {
		assignee, err := h.Queries.GetUser(r.Context(), ticket.AssigneeID)
		if err == nil {
			clientName := client.UserName
			go func() {
				subject := "Client reply: " + ticket.Subject
				if err := h.EmailService.SendTicketNotification(assignee.Email, clientName, subject, req.Body); err != nil {
					slog.Warn("failed to send portal reply notification", "error", err)
				}
			}()
		}
	}

	// Create inbox notification for the ticket assignee.
	if ticket.AssigneeType.Valid && ticket.AssigneeType.String == "member" && ticket.AssigneeID.Valid {
		details, _ := json.Marshal(map[string]string{"ticket_id": ticketID})
		h.Queries.CreateInboxItem(r.Context(), db.CreateInboxItemParams{
			WorkspaceID:   ticket.WorkspaceID,
			RecipientType: "member",
			RecipientID:   ticket.AssigneeID,
			Type:          "ticket_reply",
			Severity:      "action_required",
			Title:         fmt.Sprintf("Client replied on %s: %s", fmt.Sprintf("TKT-%d", ticket.Number), ticket.Subject),
			Body:          pgtype.Text{String: truncate(req.Body, 200), Valid: true},
			ActorType:     pgtype.Text{String: "client", Valid: true},
			ActorID:       client.ID,
			Details:       details,
		})
	}

	writeJSON(w, http.StatusCreated, TicketMessageResponse{
		ID:         uuidToString(msg.ID),
		TicketID:   uuidToString(msg.TicketID),
		Type:       msg.Type,
		Body:       msg.Body,
		SenderType: msg.SenderType,
		SenderID:   uuidToString(msg.SenderID),
		CreatedAt:  timestampToString(msg.CreatedAt),
	})
}

// ListTicketRepliesForPortal returns only replies (no internal notes) for a ticket.
func (h *Handler) ListTicketRepliesForPortal(w http.ResponseWriter, r *http.Request) {
	ticketID := chi.URLParam(r, "id")
	userID := requestUserID(r)
	wsID := h.resolveWorkspaceID(r)

	client, err := h.Queries.GetClientByUserAndWorkspace(r.Context(), db.GetClientByUserAndWorkspaceParams{
		UserID:      parseUUID(userID),
		WorkspaceID: parseUUID(wsID),
	})
	if err != nil {
		writeError(w, http.StatusForbidden, "client not found")
		return
	}

	ticket, err := h.Queries.GetTicket(r.Context(), parseUUID(ticketID))
	if err != nil {
		writeError(w, http.StatusNotFound, "ticket not found")
		return
	}
	if uuidToString(ticket.ClientID) != uuidToString(client.ID) {
		writeError(w, http.StatusForbidden, "not your ticket")
		return
	}

	replies, err := h.Queries.ListTicketReplies(r.Context(), parseUUID(ticketID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list replies")
		return
	}
	resp := make([]TicketMessageResponse, len(replies))
	for i, m := range replies {
		resp[i] = ticketReplyToResponse(m)
	}
	writeJSON(w, http.StatusOK, resp)
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}
