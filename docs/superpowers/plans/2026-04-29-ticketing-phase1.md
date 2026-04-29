# Ticketing System Phase 1: Core Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the database schema, sqlc queries, and Go API handlers for SLA policies, clients, tickets, and ticket messages.

**Architecture:** Tickets are a first-class entity separate from issues. Clients are workspace members with a "client" role scoped to specific projects. SLA policies define per-priority response/resolution targets. All APIs follow existing handler patterns (Chi router, sqlc, pgtype).

**Tech Stack:** Go 1.26, PostgreSQL 17, sqlc, Chi router, pgtype, Resend email service

---

## File Structure

### New files
- `server/migrations/066_ticketing.up.sql` — All ticketing tables
- `server/migrations/066_ticketing.down.sql` — Rollback
- `server/pkg/db/queries/sla_policy.sql` — SLA policy queries
- `server/pkg/db/queries/client.sql` — Client queries
- `server/pkg/db/queries/ticket.sql` — Ticket queries
- `server/pkg/db/queries/ticket_message.sql` — Ticket message queries
- `server/internal/handler/sla_policy.go` — SLA policy CRUD handlers
- `server/internal/handler/client.go` — Client CRUD handlers
- `server/internal/handler/ticket.go` — Ticket CRUD + portal handlers
- `server/internal/handler/ticket_message.go` — Reply and note handlers
- `packages/core/types/ticket.ts` — TypeScript types
- `packages/core/tickets/queries.ts` — TanStack Query hooks
- `packages/core/api/ticket-client.ts` — API client methods (or add to existing client.ts)

### Modified files
- `server/cmd/server/router.go` — Add ticket routes
- `server/internal/middleware/auth.go` — Add `RequireInternalMember` middleware
- `packages/core/types/index.ts` — Export ticket types
- `packages/core/types/workspace.ts` — Add "client" to MemberRole

---

### Task 1: Database Migration

**Files:**
- Create: `server/migrations/066_ticketing.up.sql`
- Create: `server/migrations/066_ticketing.down.sql`

- [ ] **Step 1: Write the up migration**

```sql
-- 066_ticketing.up.sql

-- Extend member role to include 'client'
ALTER TABLE member DROP CONSTRAINT IF EXISTS member_role_check;
ALTER TABLE member ADD CONSTRAINT member_role_check CHECK (role IN ('owner', 'admin', 'member', 'client'));

-- Add ticket_counter to workspace for ticket numbering (TKT-1, TKT-2, ...)
ALTER TABLE workspace ADD COLUMN ticket_counter INTEGER NOT NULL DEFAULT 0;

-- SLA Policy table
CREATE TABLE sla_policy (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    critical_first_response INTEGER,
    critical_update_interval INTEGER,
    critical_resolution INTEGER,
    high_first_response INTEGER,
    high_update_interval INTEGER,
    high_resolution INTEGER,
    normal_first_response INTEGER,
    normal_update_interval INTEGER,
    normal_resolution INTEGER,
    low_first_response INTEGER,
    low_update_interval INTEGER,
    low_resolution INTEGER,
    support_hours TEXT NOT NULL DEFAULT '24/7',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sla_policy_workspace ON sla_policy(workspace_id);
CREATE UNIQUE INDEX idx_sla_policy_workspace_name ON sla_policy(workspace_id, lower(name));

-- Client table (links user to workspace with SLA policy)
CREATE TABLE client (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    sla_policy_id UUID REFERENCES sla_policy(id) ON DELETE SET NULL,
    company_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_client_workspace_user ON client(workspace_id, user_id);
CREATE INDEX idx_client_workspace ON client(workspace_id);

-- Client-project junction table
CREATE TABLE client_project (
    client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    PRIMARY KEY (client_id, project_id)
);

-- Ticket table
CREATE TABLE ticket (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'support'
        CHECK (type IN ('bug', 'change_request', 'support', 'clarification')),
    priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('critical', 'high', 'normal', 'low')),
    client_status TEXT NOT NULL DEFAULT 'open'
        CHECK (client_status IN ('open', 'in_progress', 'waiting_on_you', 'resolved', 'closed')),
    internal_status TEXT NOT NULL DEFAULT 'new'
        CHECK (internal_status IN ('new', 'triage', 'assigned', 'in_progress', 'waiting_on_client', 'waiting_on_internal', 'resolved', 'closed')),
    assignee_type TEXT,
    assignee_id UUID,
    linked_issue_id UUID REFERENCES issue(id) ON DELETE SET NULL,
    pending_reply BOOLEAN NOT NULL DEFAULT false,
    source TEXT NOT NULL DEFAULT 'portal'
        CHECK (source IN ('portal', 'email', 'manual')),
    first_response_at TIMESTAMPTZ,
    first_response_due TIMESTAMPTZ,
    next_update_due TIMESTAMPTZ,
    resolution_due TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_workspace ON ticket(workspace_id);
CREATE INDEX idx_ticket_project ON ticket(project_id);
CREATE INDEX idx_ticket_client ON ticket(client_id);
CREATE INDEX idx_ticket_assignee ON ticket(assignee_type, assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_ticket_internal_status ON ticket(workspace_id, internal_status);
CREATE INDEX idx_ticket_resolution_due ON ticket(resolution_due) WHERE resolution_due IS NOT NULL AND internal_status NOT IN ('resolved', 'closed');
CREATE UNIQUE INDEX idx_ticket_workspace_number ON ticket(workspace_id, number);

-- Ticket message table (replies and notes)
CREATE TABLE ticket_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES ticket(id) ON DELETE CASCADE,
    type TEXT NOT NULL DEFAULT 'reply'
        CHECK (type IN ('reply', 'note')),
    body TEXT NOT NULL,
    sender_type TEXT NOT NULL
        CHECK (sender_type IN ('member', 'client', 'agent')),
    sender_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_message_ticket ON ticket_message(ticket_id);

-- Add ticket columns to attachment table
ALTER TABLE attachment ADD COLUMN ticket_id UUID REFERENCES ticket(id) ON DELETE CASCADE;
ALTER TABLE attachment ADD COLUMN ticket_message_id UUID REFERENCES ticket_message(id) ON DELETE CASCADE;
```

- [ ] **Step 2: Write the down migration**

```sql
-- 066_ticketing.down.sql

ALTER TABLE attachment DROP COLUMN IF EXISTS ticket_message_id;
ALTER TABLE attachment DROP COLUMN IF EXISTS ticket_id;
DROP TABLE IF EXISTS ticket_message;
DROP TABLE IF EXISTS ticket;
DROP TABLE IF EXISTS client_project;
DROP TABLE IF EXISTS client;
DROP TABLE IF EXISTS sla_policy;
ALTER TABLE workspace DROP COLUMN IF EXISTS ticket_counter;
ALTER TABLE member DROP CONSTRAINT IF EXISTS member_role_check;
ALTER TABLE member ADD CONSTRAINT member_role_check CHECK (role IN ('owner', 'admin', 'member'));
```

- [ ] **Step 3: Run the migration**

```bash
cd server && go run ./cmd/migrate up
```
Expected: `apply 066_ticketing`

- [ ] **Step 4: Commit**

```bash
git add server/migrations/066_ticketing.up.sql server/migrations/066_ticketing.down.sql
git commit -m "feat(tickets): add ticketing database schema"
```

---

### Task 2: SLA Policy Queries and Handler

**Files:**
- Create: `server/pkg/db/queries/sla_policy.sql`
- Create: `server/internal/handler/sla_policy.go`

- [ ] **Step 1: Write sqlc queries**

```sql
-- server/pkg/db/queries/sla_policy.sql

-- name: ListSLAPolicies :many
SELECT * FROM sla_policy
WHERE workspace_id = $1
ORDER BY name ASC;

-- name: GetSLAPolicy :one
SELECT * FROM sla_policy
WHERE id = $1;

-- name: CreateSLAPolicy :one
INSERT INTO sla_policy (
    workspace_id, name,
    critical_first_response, critical_update_interval, critical_resolution,
    high_first_response, high_update_interval, high_resolution,
    normal_first_response, normal_update_interval, normal_resolution,
    low_first_response, low_update_interval, low_resolution,
    support_hours
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
) RETURNING *;

-- name: UpdateSLAPolicy :one
UPDATE sla_policy SET
    name = COALESCE(sqlc.narg('name'), name),
    critical_first_response = sqlc.narg('critical_first_response'),
    critical_update_interval = sqlc.narg('critical_update_interval'),
    critical_resolution = sqlc.narg('critical_resolution'),
    high_first_response = sqlc.narg('high_first_response'),
    high_update_interval = sqlc.narg('high_update_interval'),
    high_resolution = sqlc.narg('high_resolution'),
    normal_first_response = sqlc.narg('normal_first_response'),
    normal_update_interval = sqlc.narg('normal_update_interval'),
    normal_resolution = sqlc.narg('normal_resolution'),
    low_first_response = sqlc.narg('low_first_response'),
    low_update_interval = sqlc.narg('low_update_interval'),
    low_resolution = sqlc.narg('low_resolution'),
    support_hours = COALESCE(sqlc.narg('support_hours'), support_hours),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteSLAPolicy :exec
DELETE FROM sla_policy WHERE id = $1;
```

- [ ] **Step 2: Run sqlc**

```bash
cd server && make sqlc
```

- [ ] **Step 3: Write the SLA policy handler**

```go
// server/internal/handler/sla_policy.go
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
	ID                       string `json:"id"`
	WorkspaceID              string `json:"workspace_id"`
	Name                     string `json:"name"`
	CriticalFirstResponse    *int32 `json:"critical_first_response"`
	CriticalUpdateInterval   *int32 `json:"critical_update_interval"`
	CriticalResolution       *int32 `json:"critical_resolution"`
	HighFirstResponse        *int32 `json:"high_first_response"`
	HighUpdateInterval       *int32 `json:"high_update_interval"`
	HighResolution           *int32 `json:"high_resolution"`
	NormalFirstResponse      *int32 `json:"normal_first_response"`
	NormalUpdateInterval     *int32 `json:"normal_update_interval"`
	NormalResolution         *int32 `json:"normal_resolution"`
	LowFirstResponse         *int32 `json:"low_first_response"`
	LowUpdateInterval        *int32 `json:"low_update_interval"`
	LowResolution            *int32 `json:"low_resolution"`
	SupportHours             string `json:"support_hours"`
	CreatedAt                string `json:"created_at"`
	UpdatedAt                string `json:"updated_at"`
}

func slaPolicyToResponse(p db.SlaPolicy) SLAPolicyResponse {
	return SLAPolicyResponse{
		ID:                       uuidToString(p.ID),
		WorkspaceID:              uuidToString(p.WorkspaceID),
		Name:                     p.Name,
		CriticalFirstResponse:    nullInt32Ptr(p.CriticalFirstResponse),
		CriticalUpdateInterval:   nullInt32Ptr(p.CriticalUpdateInterval),
		CriticalResolution:       nullInt32Ptr(p.CriticalResolution),
		HighFirstResponse:        nullInt32Ptr(p.HighFirstResponse),
		HighUpdateInterval:       nullInt32Ptr(p.HighUpdateInterval),
		HighResolution:           nullInt32Ptr(p.HighResolution),
		NormalFirstResponse:      nullInt32Ptr(p.NormalFirstResponse),
		NormalUpdateInterval:     nullInt32Ptr(p.NormalUpdateInterval),
		NormalResolution:         nullInt32Ptr(p.NormalResolution),
		LowFirstResponse:        nullInt32Ptr(p.LowFirstResponse),
		LowUpdateInterval:       nullInt32Ptr(p.LowUpdateInterval),
		LowResolution:           nullInt32Ptr(p.LowResolution),
		SupportHours:             p.SupportHours,
		CreatedAt:                timestampToString(p.CreatedAt),
		UpdatedAt:                timestampToString(p.UpdatedAt),
	}
}

type CreateSLAPolicyRequest struct {
	Name                     string `json:"name"`
	CriticalFirstResponse    *int32 `json:"critical_first_response"`
	CriticalUpdateInterval   *int32 `json:"critical_update_interval"`
	CriticalResolution       *int32 `json:"critical_resolution"`
	HighFirstResponse        *int32 `json:"high_first_response"`
	HighUpdateInterval       *int32 `json:"high_update_interval"`
	HighResolution           *int32 `json:"high_resolution"`
	NormalFirstResponse      *int32 `json:"normal_first_response"`
	NormalUpdateInterval     *int32 `json:"normal_update_interval"`
	NormalResolution         *int32 `json:"normal_resolution"`
	LowFirstResponse         *int32 `json:"low_first_response"`
	LowUpdateInterval        *int32 `json:"low_update_interval"`
	LowResolution            *int32 `json:"low_resolution"`
	SupportHours             string `json:"support_hours"`
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
	writeJSON(w, http.StatusOK, slaPolicyToResponse(policy))
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

// Helper: convert *int32 to pgtype.Int4
func int32PtrToPgInt4(v *int32) pgtype.Int4 {
	if v == nil {
		return pgtype.Int4{Valid: false}
	}
	return pgtype.Int4{Int32: *v, Valid: true}
}
```

- [ ] **Step 4: Verify build**

```bash
cd server && go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add server/pkg/db/queries/sla_policy.sql server/pkg/db/generated/ server/internal/handler/sla_policy.go
git commit -m "feat(tickets): add SLA policy queries and CRUD handler"
```

---

### Task 3: Client Queries and Handler

**Files:**
- Create: `server/pkg/db/queries/client.sql`
- Create: `server/internal/handler/client.go`

- [ ] **Step 1: Write sqlc queries**

```sql
-- server/pkg/db/queries/client.sql

-- name: ListClients :many
SELECT c.*, u.name AS user_name, u.email AS user_email,
       s.name AS sla_policy_name
FROM client c
JOIN "user" u ON u.id = c.user_id
LEFT JOIN sla_policy s ON s.id = c.sla_policy_id
WHERE c.workspace_id = $1
ORDER BY u.name ASC;

-- name: GetClient :one
SELECT c.*, u.name AS user_name, u.email AS user_email,
       s.name AS sla_policy_name
FROM client c
JOIN "user" u ON u.id = c.user_id
LEFT JOIN sla_policy s ON s.id = c.sla_policy_id
WHERE c.id = $1;

-- name: GetClientByUserAndWorkspace :one
SELECT c.*, u.name AS user_name, u.email AS user_email,
       s.name AS sla_policy_name
FROM client c
JOIN "user" u ON u.id = c.user_id
LEFT JOIN sla_policy s ON s.id = c.sla_policy_id
WHERE c.user_id = $1 AND c.workspace_id = $2;

-- name: CreateClient :one
INSERT INTO client (workspace_id, user_id, sla_policy_id, company_name)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateClient :one
UPDATE client SET
    sla_policy_id = sqlc.narg('sla_policy_id'),
    company_name = sqlc.narg('company_name'),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteClient :exec
DELETE FROM client WHERE id = $1;

-- name: ListClientProjects :many
SELECT p.* FROM project p
JOIN client_project cp ON cp.project_id = p.id
WHERE cp.client_id = $1
ORDER BY p.title ASC;

-- name: AddClientProject :exec
INSERT INTO client_project (client_id, project_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: RemoveClientProject :exec
DELETE FROM client_project
WHERE client_id = $1 AND project_id = $2;

-- name: ListClientProjectIDs :many
SELECT project_id FROM client_project
WHERE client_id = $1;

-- name: IncrementWorkspaceTicketCounter :one
UPDATE workspace SET ticket_counter = ticket_counter + 1
WHERE id = $1
RETURNING ticket_counter;
```

- [ ] **Step 2: Run sqlc**

```bash
cd server && make sqlc
```

- [ ] **Step 3: Write the client handler**

```go
// server/internal/handler/client.go
package handler

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
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

func clientToResponse(c db.ListClientsRow) ClientResponse {
	return ClientResponse{
		ID:            uuidToString(c.ID),
		WorkspaceID:   uuidToString(c.WorkspaceID),
		UserID:        uuidToString(c.UserID),
		UserName:      c.UserName,
		UserEmail:     c.UserEmail,
		SLAPolicyID:   uuidToPtr(c.SlaPolicy),
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
		resp[i] = clientToResponse(c)
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
	writeJSON(w, http.StatusOK, ClientResponse{
		ID:            uuidToString(client.ID),
		WorkspaceID:   uuidToString(client.WorkspaceID),
		UserID:        uuidToString(client.UserID),
		UserName:      client.UserName,
		UserEmail:     client.UserEmail,
		SLAPolicyID:   uuidToPtr(client.SlaPolicy),
		SLAPolicyName: textToPtr(client.SlaPolicyName),
		CompanyName:   textToPtr(client.CompanyName),
		CreatedAt:     timestampToString(client.CreatedAt),
		UpdatedAt:     timestampToString(client.UpdatedAt),
	})
}

func (h *Handler) CreateClientWithInvite(w http.ResponseWriter, r *http.Request) {
	wsID := h.resolveWorkspaceID(r)
	userID := requestUserID(r)

	var req CreateClientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}
	if len(req.ProjectIDs) == 0 {
		writeError(w, http.StatusBadRequest, "at least one project_id is required")
		return
	}

	// Find or create the user by email
	user, err := h.Queries.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		// User doesn't exist yet — create a placeholder user
		user, err = h.Queries.CreateUser(r.Context(), db.CreateUserParams{
			Name:  req.Email, // Will be updated when they accept
			Email: req.Email,
		})
		if err != nil {
			slog.Warn("create user for client failed", append(logger.RequestAttrs(r), "error", err)...)
			writeError(w, http.StatusInternalServerError, "failed to create client user")
			return
		}
	}

	tx, err := h.TxStarter.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create client")
		return
	}
	defer tx.Rollback(r.Context())
	qtx := h.Queries.WithTx(tx)

	// Create member record with "client" role
	_, err = qtx.CreateMember(r.Context(), db.CreateMemberParams{
		WorkspaceID: parseUUID(wsID),
		UserID:      user.ID,
		Role:        "client",
	})
	if err != nil {
		// Member might already exist — check if it's already a client
		slog.Warn("create client member failed (may already exist)", append(logger.RequestAttrs(r), "error", err)...)
	}

	// Create client record
	var slaPolicyID pgtype.UUID
	if req.SLAPolicyID != nil {
		slaPolicyID = parseUUID(*req.SLAPolicyID)
	}
	client, err := qtx.CreateClient(r.Context(), db.CreateClientParams{
		WorkspaceID: parseUUID(wsID),
		UserID:      user.ID,
		SlaPolicy:   slaPolicyID,
		CompanyName: ptrToText(req.CompanyName),
	})
	if err != nil {
		slog.Warn("create client failed", append(logger.RequestAttrs(r), "error", err)...)
		writeError(w, http.StatusInternalServerError, "failed to create client")
		return
	}

	// Link projects
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

	// Send invitation email
	inviterUser, _ := h.Queries.GetUser(r.Context(), parseUUID(userID))
	ws, _ := h.Queries.GetWorkspace(r.Context(), parseUUID(wsID))
	if h.EmailService != nil && inviterUser.ID.Valid {
		go h.EmailService.SendInvitationEmail(req.Email, inviterUser.Name, ws.Name, uuidToString(client.ID))
	}

	slog.Info("client created", append(logger.RequestAttrs(r), "client_id", uuidToString(client.ID))...)
	writeJSON(w, http.StatusOK, map[string]string{
		"id":     uuidToString(client.ID),
		"status": "created",
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
		SlaPolicy:   optionalUUID(req.SLAPolicyID),
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

func optionalUUID(s *string) pgtype.UUID {
	if s == nil {
		return pgtype.UUID{Valid: false}
	}
	return parseUUID(*s)
}
```

- [ ] **Step 4: Verify build**

```bash
cd server && go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add server/pkg/db/queries/client.sql server/pkg/db/generated/ server/internal/handler/client.go
git commit -m "feat(tickets): add client queries and CRUD handler with invite"
```

---

### Task 4: Ticket Queries and Handler

**Files:**
- Create: `server/pkg/db/queries/ticket.sql`
- Create: `server/internal/handler/ticket.go`

- [ ] **Step 1: Write sqlc queries**

```sql
-- server/pkg/db/queries/ticket.sql

-- name: ListTickets :many
SELECT t.*, c.company_name AS client_company, u.name AS client_name,
       p.title AS project_title
FROM ticket t
JOIN client cl ON cl.id = t.client_id
JOIN "user" u ON u.id = cl.user_id
LEFT JOIN project p ON p.id = t.project_id
WHERE t.workspace_id = $1
  AND (sqlc.narg('internal_status')::text IS NULL OR t.internal_status = sqlc.narg('internal_status'))
  AND (sqlc.narg('priority')::text IS NULL OR t.priority = sqlc.narg('priority'))
  AND (sqlc.narg('project_id')::uuid IS NULL OR t.project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR t.assignee_id = sqlc.narg('assignee_id'))
  AND (sqlc.narg('client_id')::uuid IS NULL OR t.client_id = sqlc.narg('client_id'))
ORDER BY
  CASE t.priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 4
  END,
  t.created_at DESC
LIMIT $2 OFFSET $3;

-- name: CountTickets :one
SELECT COUNT(*) FROM ticket
WHERE workspace_id = $1
  AND (sqlc.narg('internal_status')::text IS NULL OR internal_status = sqlc.narg('internal_status'))
  AND (sqlc.narg('priority')::text IS NULL OR priority = sqlc.narg('priority'))
  AND (sqlc.narg('project_id')::uuid IS NULL OR project_id = sqlc.narg('project_id'))
  AND (sqlc.narg('assignee_id')::uuid IS NULL OR assignee_id = sqlc.narg('assignee_id'))
  AND (sqlc.narg('client_id')::uuid IS NULL OR client_id = sqlc.narg('client_id'));

-- name: GetTicket :one
SELECT t.*, c.company_name AS client_company, u.name AS client_name,
       p.title AS project_title
FROM ticket t
JOIN client cl ON cl.id = t.client_id
JOIN "user" u ON u.id = cl.user_id
LEFT JOIN project p ON p.id = t.project_id
WHERE t.id = $1;

-- name: CreateTicket :one
INSERT INTO ticket (
    workspace_id, project_id, client_id, number,
    subject, description, type, priority,
    client_status, internal_status, source,
    first_response_due, next_update_due, resolution_due
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
) RETURNING *;

-- name: UpdateTicket :one
UPDATE ticket SET
    subject = COALESCE(sqlc.narg('subject'), subject),
    description = COALESCE(sqlc.narg('description'), description),
    type = COALESCE(sqlc.narg('type'), type),
    priority = COALESCE(sqlc.narg('priority'), priority),
    client_status = COALESCE(sqlc.narg('client_status'), client_status),
    internal_status = COALESCE(sqlc.narg('internal_status'), internal_status),
    assignee_type = sqlc.narg('assignee_type'),
    assignee_id = sqlc.narg('assignee_id'),
    linked_issue_id = sqlc.narg('linked_issue_id'),
    pending_reply = COALESCE(sqlc.narg('pending_reply'), pending_reply),
    first_response_at = sqlc.narg('first_response_at'),
    resolved_at = sqlc.narg('resolved_at'),
    closed_at = sqlc.narg('closed_at'),
    next_update_due = sqlc.narg('next_update_due'),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteTicket :exec
DELETE FROM ticket WHERE id = $1;

-- name: ListTicketsForClient :many
SELECT t.*, p.title AS project_title
FROM ticket t
LEFT JOIN project p ON p.id = t.project_id
WHERE t.client_id = $1
ORDER BY t.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetTicketForClient :one
SELECT t.*, p.title AS project_title
FROM ticket t
LEFT JOIN project p ON p.id = t.project_id
WHERE t.id = $1 AND t.client_id = $2;

-- name: ListSLABreachedTickets :many
SELECT t.*, u.name AS client_name, p.title AS project_title
FROM ticket t
JOIN client cl ON cl.id = t.client_id
JOIN "user" u ON u.id = cl.user_id
LEFT JOIN project p ON p.id = t.project_id
WHERE t.workspace_id = $1
  AND t.internal_status NOT IN ('resolved', 'closed')
  AND (
    (t.first_response_due IS NOT NULL AND t.first_response_at IS NULL AND t.first_response_due < now())
    OR (t.resolution_due IS NOT NULL AND t.resolution_due < now())
    OR (t.next_update_due IS NOT NULL AND t.next_update_due < now())
  )
ORDER BY
  CASE t.priority
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'normal' THEN 3
    WHEN 'low' THEN 4
  END,
  t.created_at ASC;
```

- [ ] **Step 2: Run sqlc**

```bash
cd server && make sqlc
```

- [ ] **Step 3: Write the ticket handler**

Create `server/internal/handler/ticket.go` with:
- `TicketResponse` struct and `ticketToResponse` converter
- `CreateTicketRequest` struct
- `UpdateTicketRequest` struct
- `ListTickets` — list with filters, uses `h.resolveWorkspaceID(r)`
- `GetTicket` — get by ID
- `CreateTicket` — validates client exists, increments workspace ticket counter in transaction, computes SLA deadlines from client's SLA policy + priority
- `UpdateTicket` — partial update with `rawFields` pattern (same as issue update), derives `client_status` from `internal_status` changes
- `DeleteTicket` — delete by ID
- `CreateTicketFromPortal` — client-facing endpoint: resolves client from user ID, validates project access, creates ticket
- `GetTicketForPortal` — client-facing: validates ticket belongs to client
- `ListTicketsForPortal` — client-facing: lists only the client's tickets
- `ResolveTicketFromPortal` — client marks ticket as resolved
- `ReopenTicketFromPortal` — client reopens a resolved ticket
- `GetSLAMonitor` — returns breached/at-risk tickets grouped by severity
- Helper: `computeSLADeadlines(policy db.SlaPolicy, priority string, now time.Time)` — returns first_response_due, next_update_due, resolution_due
- Helper: `deriveClientStatus(internalStatus string) string` — maps internal status to client-visible status per the spec's mapping table

The handler will follow the exact same patterns as `issue.go`: decode request, validate, transaction for counter, create, publish event, return response.

SLA deadline computation: look up the client's SLA policy, pick the row matching the ticket priority (critical/high/normal/low), add minutes to `now()` for each deadline.

- [ ] **Step 4: Verify build**

```bash
cd server && go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add server/pkg/db/queries/ticket.sql server/pkg/db/generated/ server/internal/handler/ticket.go
git commit -m "feat(tickets): add ticket queries and handler with SLA computation"
```

---

### Task 5: Ticket Message Queries and Handler

**Files:**
- Create: `server/pkg/db/queries/ticket_message.sql`
- Create: `server/internal/handler/ticket_message.go`

- [ ] **Step 1: Write sqlc queries**

```sql
-- server/pkg/db/queries/ticket_message.sql

-- name: ListTicketMessages :many
SELECT tm.*, u.name AS sender_name
FROM ticket_message tm
JOIN "user" u ON u.id = tm.sender_id
WHERE tm.ticket_id = $1
ORDER BY tm.created_at ASC;

-- name: ListTicketReplies :many
SELECT tm.*, u.name AS sender_name
FROM ticket_message tm
JOIN "user" u ON u.id = tm.sender_id
WHERE tm.ticket_id = $1 AND tm.type = 'reply'
ORDER BY tm.created_at ASC;

-- name: CreateTicketMessage :one
INSERT INTO ticket_message (ticket_id, type, body, sender_type, sender_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: CountTeamRepliesForTicket :one
SELECT COUNT(*) FROM ticket_message
WHERE ticket_id = $1 AND type = 'reply' AND sender_type = 'member';
```

- [ ] **Step 2: Run sqlc**

```bash
cd server && make sqlc
```

- [ ] **Step 3: Write the ticket message handler**

Create `server/internal/handler/ticket_message.go` with:
- `TicketMessageResponse` struct and converter
- `CreateTicketReply` — team sends a public reply. After creating the message:
  - If this is the first team reply (`CountTeamRepliesForTicket == 1`), set `first_response_at = now()` on the ticket
  - Reset `next_update_due` based on SLA policy
  - If ticket has `pending_reply = true`, set it to `false`
  - Send email notification to client via `h.EmailService`
- `CreateTicketNote` — team adds an internal note. No email, no SLA impact.
- `CreateTicketReplyFromPortal` — client sends a reply. After creating:
  - Email notification to assigned team member (or workspace admins if unassigned)
  - Set `internal_status = waiting_on_internal` if currently `waiting_on_client`
- `ListTicketMessages` — returns all messages (replies + notes) for team view
- `ListTicketRepliesForPortal` — returns only replies for client view

- [ ] **Step 4: Verify build**

```bash
cd server && go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add server/pkg/db/queries/ticket_message.sql server/pkg/db/generated/ server/internal/handler/ticket_message.go
git commit -m "feat(tickets): add ticket message handler with reply and note support"
```

---

### Task 6: Auth Middleware and Router Wiring

**Files:**
- Modify: `server/internal/middleware/auth.go`
- Modify: `server/cmd/server/router.go`

- [ ] **Step 1: Add RequireInternalMember middleware**

In `server/internal/middleware/auth.go`, add a middleware that blocks clients from internal routes:

```go
// RequireInternalMember blocks users with role "client" from accessing internal routes.
func RequireInternalMember(queries *db.Queries) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID := r.Context().Value(UserIDKey)
			if userID == nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			wsID := r.Header.Get("X-Workspace-ID")
			if wsID == "" {
				next.ServeHTTP(w, r)
				return
			}
			member, err := queries.GetMemberByUserAndWorkspace(r.Context(), db.GetMemberByUserAndWorkspaceParams{
				UserID:      parseUUID(userID.(string)),
				WorkspaceID: parseUUID(wsID),
			})
			if err != nil {
				http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
				return
			}
			if member.Role == "client" {
				http.Error(w, `{"error":"access denied"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
```

- [ ] **Step 2: Wire routes in router.go**

Add ticket routes to the router. Internal ticket routes go under the existing auth group with `RequireInternalMember`. Portal routes go in a separate group that allows clients:

```go
// Internal ticket routes (team-only)
r.Route("/api/tickets", func(r chi.Router) {
    r.Use(middleware.RequireInternalMember(queries))
    r.Get("/", h.ListTickets)
    r.Get("/sla-monitor", h.GetSLAMonitor)
    r.Route("/{id}", func(r chi.Router) {
        r.Get("/", h.GetTicket)
        r.Put("/", h.UpdateTicket)
        r.Delete("/", h.DeleteTicket)
        r.Post("/reply", h.CreateTicketReply)
        r.Post("/note", h.CreateTicketNote)
        r.Post("/link-issue", h.LinkIssueToTicket)
        r.Post("/create-issue", h.CreateIssueFromTicket)
        r.Get("/messages", h.ListTicketMessages)
    })
})

// SLA Policy routes (admin-only)
r.Route("/api/sla-policies", func(r chi.Router) {
    r.Use(middleware.RequireInternalMember(queries))
    r.Get("/", h.ListSLAPolicies)
    r.Post("/", h.CreateSLAPolicy)
    r.Route("/{id}", func(r chi.Router) {
        r.Get("/", h.GetSLAPolicy)
        r.Put("/", h.UpdateSLAPolicy)
        r.Delete("/", h.DeleteSLAPolicy)
    })
})

// Client management routes (admin-only)
r.Route("/api/clients", func(r chi.Router) {
    r.Use(middleware.RequireInternalMember(queries))
    r.Get("/", h.ListClients)
    r.Post("/", h.CreateClientWithInvite)
    r.Route("/{id}", func(r chi.Router) {
        r.Get("/", h.GetClient)
        r.Put("/", h.UpdateClient)
        r.Delete("/", h.DeleteClientRecord)
        r.Get("/projects", h.ListClientProjects)
        r.Post("/projects/{projectId}", h.AddClientProject)
        r.Delete("/projects/{projectId}", h.RemoveClientProject)
    })
})

// Portal routes (client-accessible)
r.Route("/api/portal", func(r chi.Router) {
    r.Get("/tickets", h.ListTicketsForPortal)
    r.Post("/tickets", h.CreateTicketFromPortal)
    r.Route("/tickets/{id}", func(r chi.Router) {
        r.Get("/", h.GetTicketForPortal)
        r.Post("/reply", h.CreateTicketReplyFromPortal)
        r.Patch("/resolve", h.ResolveTicketFromPortal)
        r.Patch("/reopen", h.ReopenTicketFromPortal)
        r.Get("/replies", h.ListTicketRepliesForPortal)
    })
    r.Get("/projects", h.ListPortalProjects)
    r.Post("/upload", h.UploadFile)
})
```

- [ ] **Step 3: Verify build**

```bash
cd server && go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add server/internal/middleware/auth.go server/cmd/server/router.go
git commit -m "feat(tickets): wire ticket routes and add client auth middleware"
```

---

### Task 7: TypeScript Types and API Client

**Files:**
- Create: `packages/core/types/ticket.ts`
- Modify: `packages/core/types/index.ts`
- Modify: `packages/core/types/workspace.ts`
- Modify: `packages/core/api/client.ts`

- [ ] **Step 1: Add TypeScript types**

```typescript
// packages/core/types/ticket.ts

export type TicketType = "bug" | "change_request" | "support" | "clarification";
export type TicketPriority = "critical" | "high" | "normal" | "low";
export type TicketClientStatus = "open" | "in_progress" | "waiting_on_you" | "resolved" | "closed";
export type TicketInternalStatus = "new" | "triage" | "assigned" | "in_progress" | "waiting_on_client" | "waiting_on_internal" | "resolved" | "closed";
export type TicketSource = "portal" | "email" | "manual";
export type TicketMessageType = "reply" | "note";

export interface SLAPolicy {
  id: string;
  workspace_id: string;
  name: string;
  critical_first_response: number | null;
  critical_update_interval: number | null;
  critical_resolution: number | null;
  high_first_response: number | null;
  high_update_interval: number | null;
  high_resolution: number | null;
  normal_first_response: number | null;
  normal_update_interval: number | null;
  normal_resolution: number | null;
  low_first_response: number | null;
  low_update_interval: number | null;
  low_resolution: number | null;
  support_hours: string;
  created_at: string;
  updated_at: string;
}

export interface CreateSLAPolicyRequest {
  name: string;
  critical_first_response?: number | null;
  critical_update_interval?: number | null;
  critical_resolution?: number | null;
  high_first_response?: number | null;
  high_update_interval?: number | null;
  high_resolution?: number | null;
  normal_first_response?: number | null;
  normal_update_interval?: number | null;
  normal_resolution?: number | null;
  low_first_response?: number | null;
  low_update_interval?: number | null;
  low_resolution?: number | null;
  support_hours?: string;
}

export interface Client {
  id: string;
  workspace_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  sla_policy_id: string | null;
  sla_policy_name: string | null;
  company_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateClientRequest {
  email: string;
  sla_policy_id?: string;
  company_name?: string;
  project_ids: string[];
}

export interface UpdateClientRequest {
  sla_policy_id?: string | null;
  company_name?: string | null;
}

export interface Ticket {
  id: string;
  workspace_id: string;
  project_id: string;
  client_id: string;
  number: number;
  identifier: string;
  subject: string;
  description: string;
  type: TicketType;
  priority: TicketPriority;
  client_status: TicketClientStatus;
  internal_status: TicketInternalStatus;
  assignee_type: string | null;
  assignee_id: string | null;
  linked_issue_id: string | null;
  pending_reply: boolean;
  source: TicketSource;
  first_response_at: string | null;
  first_response_due: string | null;
  next_update_due: string | null;
  resolution_due: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  client_name: string;
  client_company: string | null;
  project_title: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTicketRequest {
  project_id: string;
  subject: string;
  description: string;
  type: TicketType;
  priority: TicketPriority;
  attachment_ids?: string[];
}

export interface UpdateTicketRequest {
  subject?: string;
  description?: string;
  type?: TicketType;
  priority?: TicketPriority;
  internal_status?: TicketInternalStatus;
  assignee_type?: string | null;
  assignee_id?: string | null;
  linked_issue_id?: string | null;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  type: TicketMessageType;
  body: string;
  sender_type: string;
  sender_id: string;
  sender_name: string;
  created_at: string;
}
```

- [ ] **Step 2: Update workspace types**

In `packages/core/types/workspace.ts`, add "client" to MemberRole:

```typescript
export type MemberRole = "owner" | "admin" | "member" | "client";
```

- [ ] **Step 3: Update index exports**

In `packages/core/types/index.ts`, add:

```typescript
export type {
  TicketType, TicketPriority, TicketClientStatus, TicketInternalStatus,
  TicketSource, TicketMessageType, SLAPolicy, CreateSLAPolicyRequest,
  Client, CreateClientRequest, UpdateClientRequest,
  Ticket, CreateTicketRequest, UpdateTicketRequest, TicketMessage,
} from "./ticket";
```

- [ ] **Step 4: Add API client methods**

In `packages/core/api/client.ts`, add methods for SLA policies, clients, tickets, and ticket messages. Follow the existing pattern (async methods, URLSearchParams for GET, JSON body for POST/PUT):

```typescript
// SLA Policies
async listSLAPolicies(): Promise<SLAPolicy[]> {
  return this.fetch("/api/sla-policies");
}
async createSLAPolicy(data: CreateSLAPolicyRequest): Promise<SLAPolicy> {
  return this.fetch("/api/sla-policies", { method: "POST", body: JSON.stringify(data) });
}
async updateSLAPolicy(id: string, data: CreateSLAPolicyRequest): Promise<SLAPolicy> {
  return this.fetch(`/api/sla-policies/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
async deleteSLAPolicy(id: string): Promise<void> {
  await this.fetch(`/api/sla-policies/${id}`, { method: "DELETE" });
}

// Clients
async listClients(): Promise<Client[]> {
  return this.fetch("/api/clients");
}
async getClient(id: string): Promise<Client> {
  return this.fetch(`/api/clients/${id}`);
}
async createClient(data: CreateClientRequest): Promise<{ id: string; status: string }> {
  return this.fetch("/api/clients", { method: "POST", body: JSON.stringify(data) });
}
async updateClient(id: string, data: UpdateClientRequest): Promise<{ id: string; status: string }> {
  return this.fetch(`/api/clients/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
async deleteClient(id: string): Promise<void> {
  await this.fetch(`/api/clients/${id}`, { method: "DELETE" });
}
async addClientProject(clientId: string, projectId: string): Promise<void> {
  await this.fetch(`/api/clients/${clientId}/projects/${projectId}`, { method: "POST" });
}
async removeClientProject(clientId: string, projectId: string): Promise<void> {
  await this.fetch(`/api/clients/${clientId}/projects/${projectId}`, { method: "DELETE" });
}

// Tickets (internal)
async listTickets(params?: { status?: string; priority?: string; project_id?: string; assignee_id?: string; client_id?: string; limit?: number; offset?: number }): Promise<{ tickets: Ticket[]; total: number }> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.priority) search.set("priority", params.priority);
  if (params?.project_id) search.set("project_id", params.project_id);
  if (params?.assignee_id) search.set("assignee_id", params.assignee_id);
  if (params?.client_id) search.set("client_id", params.client_id);
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.offset !== undefined) search.set("offset", String(params.offset));
  return this.fetch(`/api/tickets?${search}`);
}
async getTicket(id: string): Promise<Ticket> {
  return this.fetch(`/api/tickets/${id}`);
}
async updateTicket(id: string, data: UpdateTicketRequest): Promise<Ticket> {
  return this.fetch(`/api/tickets/${id}`, { method: "PUT", body: JSON.stringify(data) });
}
async deleteTicket(id: string): Promise<void> {
  await this.fetch(`/api/tickets/${id}`, { method: "DELETE" });
}
async createTicketReply(ticketId: string, body: string, attachmentIds?: string[]): Promise<TicketMessage> {
  return this.fetch(`/api/tickets/${ticketId}/reply`, { method: "POST", body: JSON.stringify({ body, attachment_ids: attachmentIds }) });
}
async createTicketNote(ticketId: string, body: string): Promise<TicketMessage> {
  return this.fetch(`/api/tickets/${ticketId}/note`, { method: "POST", body: JSON.stringify({ body }) });
}
async listTicketMessages(ticketId: string): Promise<TicketMessage[]> {
  return this.fetch(`/api/tickets/${ticketId}/messages`);
}
async getTicketSLAMonitor(): Promise<{ breached: Ticket[]; at_risk: Ticket[]; waiting_on_client: Ticket[] }> {
  return this.fetch("/api/tickets/sla-monitor");
}
async createIssueFromTicket(ticketId: string, data: { team_id: string }): Promise<Issue> {
  return this.fetch(`/api/tickets/${ticketId}/create-issue`, { method: "POST", body: JSON.stringify(data) });
}
async linkIssueToTicket(ticketId: string, issueId: string): Promise<void> {
  await this.fetch(`/api/tickets/${ticketId}/link-issue`, { method: "POST", body: JSON.stringify({ issue_id: issueId }) });
}

// Portal (client-facing)
async listPortalTickets(params?: { limit?: number; offset?: number }): Promise<{ tickets: Ticket[]; total: number }> {
  const search = new URLSearchParams();
  if (params?.limit !== undefined) search.set("limit", String(params.limit));
  if (params?.offset !== undefined) search.set("offset", String(params.offset));
  return this.fetch(`/api/portal/tickets?${search}`);
}
async getPortalTicket(id: string): Promise<Ticket> {
  return this.fetch(`/api/portal/tickets/${id}`);
}
async createPortalTicket(data: CreateTicketRequest): Promise<Ticket> {
  return this.fetch("/api/portal/tickets", { method: "POST", body: JSON.stringify(data) });
}
async createPortalReply(ticketId: string, body: string, attachmentIds?: string[]): Promise<TicketMessage> {
  return this.fetch(`/api/portal/tickets/${ticketId}/reply`, { method: "POST", body: JSON.stringify({ body, attachment_ids: attachmentIds }) });
}
async resolvePortalTicket(id: string): Promise<void> {
  await this.fetch(`/api/portal/tickets/${id}/resolve`, { method: "PATCH" });
}
async reopenPortalTicket(id: string): Promise<void> {
  await this.fetch(`/api/portal/tickets/${id}/reopen`, { method: "PATCH" });
}
async listPortalReplies(ticketId: string): Promise<TicketMessage[]> {
  return this.fetch(`/api/portal/tickets/${ticketId}/replies`);
}
async listPortalProjects(): Promise<Project[]> {
  return this.fetch("/api/portal/projects");
}
```

- [ ] **Step 5: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/types/ticket.ts packages/core/types/index.ts packages/core/types/workspace.ts packages/core/api/client.ts
git commit -m "feat(tickets): add TypeScript types and API client methods"
```

---

### Task 8: TanStack Query Hooks

**Files:**
- Create: `packages/core/tickets/queries.ts`
- Create: `packages/core/tickets/index.ts`

- [ ] **Step 1: Write query hooks**

```typescript
// packages/core/tickets/queries.ts
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const ticketKeys = {
  all: (wsId: string) => ["tickets", wsId] as const,
  list: (wsId: string, filters?: Record<string, string>) =>
    [...ticketKeys.all(wsId), "list", filters ?? {}] as const,
  detail: (wsId: string, id: string) =>
    [...ticketKeys.all(wsId), "detail", id] as const,
  messages: (ticketId: string) => ["tickets", "messages", ticketId] as const,
  slaMonitor: (wsId: string) => [...ticketKeys.all(wsId), "sla-monitor"] as const,
};

export const slaPolicyKeys = {
  all: (wsId: string) => ["sla-policies", wsId] as const,
  list: (wsId: string) => [...slaPolicyKeys.all(wsId), "list"] as const,
};

export const clientKeys = {
  all: (wsId: string) => ["clients", wsId] as const,
  list: (wsId: string) => [...clientKeys.all(wsId), "list"] as const,
  detail: (wsId: string, id: string) => [...clientKeys.all(wsId), "detail", id] as const,
};

export function ticketListOptions(wsId: string, filters?: Record<string, string>) {
  return queryOptions({
    queryKey: ticketKeys.list(wsId, filters),
    queryFn: () => api.listTickets({ ...filters, limit: 100, offset: 0 }),
  });
}

export function ticketDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: ticketKeys.detail(wsId, id),
    queryFn: () => api.getTicket(id),
  });
}

export function ticketMessagesOptions(ticketId: string) {
  return queryOptions({
    queryKey: ticketKeys.messages(ticketId),
    queryFn: () => api.listTicketMessages(ticketId),
  });
}

export function slaMonitorOptions(wsId: string) {
  return queryOptions({
    queryKey: ticketKeys.slaMonitor(wsId),
    queryFn: () => api.getTicketSLAMonitor(),
  });
}

export function slaPolicyListOptions(wsId: string) {
  return queryOptions({
    queryKey: slaPolicyKeys.list(wsId),
    queryFn: () => api.listSLAPolicies(),
  });
}

export function clientListOptions(wsId: string) {
  return queryOptions({
    queryKey: clientKeys.list(wsId),
    queryFn: () => api.listClients(),
  });
}

export function clientDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: clientKeys.detail(wsId, id),
    queryFn: () => api.getClient(id),
  });
}

// Portal queries
export const portalTicketKeys = {
  all: () => ["portal-tickets"] as const,
  list: () => [...portalTicketKeys.all(), "list"] as const,
  detail: (id: string) => [...portalTicketKeys.all(), "detail", id] as const,
  replies: (ticketId: string) => [...portalTicketKeys.all(), "replies", ticketId] as const,
  projects: () => ["portal-projects"] as const,
};

export function portalTicketListOptions() {
  return queryOptions({
    queryKey: portalTicketKeys.list(),
    queryFn: () => api.listPortalTickets({ limit: 100, offset: 0 }),
  });
}

export function portalTicketDetailOptions(id: string) {
  return queryOptions({
    queryKey: portalTicketKeys.detail(id),
    queryFn: () => api.getPortalTicket(id),
  });
}

export function portalRepliesOptions(ticketId: string) {
  return queryOptions({
    queryKey: portalTicketKeys.replies(ticketId),
    queryFn: () => api.listPortalReplies(ticketId),
  });
}

export function portalProjectsOptions() {
  return queryOptions({
    queryKey: portalTicketKeys.projects(),
    queryFn: () => api.listPortalProjects(),
  });
}
```

- [ ] **Step 2: Write index file**

```typescript
// packages/core/tickets/index.ts
export {
  ticketKeys, slaPolicyKeys, clientKeys, portalTicketKeys,
  ticketListOptions, ticketDetailOptions, ticketMessagesOptions,
  slaMonitorOptions, slaPolicyListOptions, clientListOptions, clientDetailOptions,
  portalTicketListOptions, portalTicketDetailOptions, portalRepliesOptions, portalProjectsOptions,
} from "./queries";
```

- [ ] **Step 3: Verify typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add packages/core/tickets/
git commit -m "feat(tickets): add TanStack Query hooks for tickets, clients, and SLA policies"
```

---

### Task 9: Verify End-to-End

- [ ] **Step 1: Run Go build**

```bash
cd server && go build ./...
```

- [ ] **Step 2: Run TypeScript typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Run Go tests**

```bash
cd server && go test ./...
```

- [ ] **Step 4: Run frontend tests**

```bash
pnpm test
```

- [ ] **Step 5: Run migration up and down to verify reversibility**

```bash
cd server && go run ./cmd/migrate down && go run ./cmd/migrate up
```

- [ ] **Step 6: Final commit if any fixes needed**

```bash
git add -A && git commit -m "fix(tickets): address build/test issues from phase 1"
```
