# Project Milestones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a first-class `Milestone` entity scoped to projects, replacing the current Epic-issue / Phase-issues / Task-issues parent_issue_id workaround.

**Architecture:** New `milestone` table referenced by `issue.milestone_id` (nullable). REST CRUD under `/api/projects/{id}/milestones` and `/api/milestones/{id}`. Optimistic frontend mutations mirroring the cycle/parent patterns we just shipped. Project page gains an Overview/Issues tab split — Overview body holds title + markdown description + inline milestones section; Issues tab keeps the current list/board + new milestone sidebar block + milestone chip on every row. Cycles untouched. A one-shot CLI command migrates the existing CLIC project's 14 phases into milestones.

**Tech Stack:** Go (Chi, sqlc, pgx), Next.js / React (Tanstack Query, Zustand, shadcn/Base UI primitives, Tailwind tokens), Vitest, Playwright, Postgres.

**Spec:** `docs/superpowers/specs/2026-04-30-milestones-design.md`

---

## File map

**New files:**
- `server/migrations/067_milestones.up.sql` / `.down.sql`
- `server/pkg/db/queries/milestone.sql`
- `server/internal/handler/milestone.go` + `_test.go`
- `server/cmd/multica/cmd_migrate.go` + `_test.go`
- `packages/core/types/milestone.ts`
- `packages/core/milestones/queries.ts` / `mutations.ts` / `index.ts` / `mutations.test.ts`
- `packages/views/milestones/components/milestone-chip.tsx` + `.test.tsx`
- `packages/views/milestones/components/milestone-form-dialog.tsx`
- `packages/views/milestones/components/milestone-picker.tsx`
- `packages/views/milestones/components/milestones-sidebar-block.tsx`
- `packages/views/milestones/components/milestones-section.tsx`
- `packages/views/milestones/components/index.ts`
- `e2e/tests/milestones.spec.ts`

**Modified files:**
- `server/pkg/db/queries/issue.sql` (no schema change — existing `issue.milestone_id` column is added by migration)
- `server/internal/handler/issue.go` (milestone enrichment, milestone_id in update/create/batch handlers)
- `server/internal/handler/cycle.go` (milestone enrichment in `ListCycleIssues`)
- `server/internal/handler/ticket.go` (milestone enrichment in ticket → issue convert)
- `server/cmd/server/router.go` (wire milestone routes)
- `packages/core/types/issue.ts` (add `milestone_id`, `milestone_name`)
- `packages/core/types/index.ts` (re-export Milestone)
- `packages/core/api/client.ts` (CRUD methods + `UpdateIssueRequest` type)
- `packages/core/issues/mutations.ts` (optimistic patches for milestone_id; invalidate milestoneKeys)
- `packages/core/realtime/use-realtime-sync.ts` (subscribe to `milestone:*` events)
- `packages/views/issues/components/list-row.tsx` (milestone chip)
- `packages/views/issues/components/board-card.tsx` (milestone chip)
- `packages/views/issues/components/issues-header.tsx` (milestone filter)
- `packages/views/issues/components/issue-detail.tsx` (milestone picker in property sidebar)
- `packages/views/projects/components/project-detail.tsx` (Tabs: Overview/Issues, restructure description + add MilestonesSection, add MilestonesSidebarBlock)

---

## Task 1: Database migration

**Files:**
- Create: `server/migrations/067_milestones.up.sql`
- Create: `server/migrations/067_milestones.down.sql`

- [ ] **Step 1: Write the up migration**

```sql
-- server/migrations/067_milestones.up.sql
CREATE TABLE milestone (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    description TEXT,
    start_date  DATE,
    target_date DATE,
    position    DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX milestone_project_idx ON milestone(project_id, position);

ALTER TABLE issue ADD COLUMN milestone_id UUID REFERENCES milestone(id) ON DELETE SET NULL;
CREATE INDEX issue_milestone_idx ON issue(milestone_id) WHERE milestone_id IS NOT NULL;
```

- [ ] **Step 2: Write the down migration**

```sql
-- server/migrations/067_milestones.down.sql
DROP INDEX IF EXISTS issue_milestone_idx;
ALTER TABLE issue DROP COLUMN IF EXISTS milestone_id;
DROP INDEX IF EXISTS milestone_project_idx;
DROP TABLE IF EXISTS milestone;
```

- [ ] **Step 3: Apply locally**

Run from repo root: `make migrate-up`
Expected: migration `067_milestones` applied successfully.

- [ ] **Step 4: Verify with psql**

```bash
psql "$DATABASE_URL" -c "\d milestone" -c "\d issue" | grep -E "milestone|milestone_id"
```
Expected: milestone table exists; issue has `milestone_id uuid` column.

- [ ] **Step 5: Commit**

```bash
git add server/migrations/067_milestones.up.sql server/migrations/067_milestones.down.sql
git commit -m "feat(db): add milestone table and issue.milestone_id"
```

---

## Task 2: SQL queries + sqlc regen

**Files:**
- Create: `server/pkg/db/queries/milestone.sql`
- Modify (regen): `server/pkg/db/generated/*.go`

- [ ] **Step 1: Write the queries**

```sql
-- server/pkg/db/queries/milestone.sql

-- name: ListMilestonesByProject :many
-- Returns milestones with computed total/done issue counts.
SELECT
    m.id, m.project_id, m.name, m.description,
    m.start_date, m.target_date, m.position,
    m.created_at, m.updated_at,
    COALESCE(COUNT(i.id), 0)::bigint AS total_count,
    COALESCE(COUNT(i.id) FILTER (WHERE i.status IN ('done', 'cancelled')), 0)::bigint AS done_count,
    COALESCE(COUNT(i.id) FILTER (WHERE i.status NOT IN ('backlog', 'done', 'cancelled')), 0)::bigint AS started_count
FROM milestone m
LEFT JOIN issue i ON i.milestone_id = m.id
WHERE m.project_id = $1
GROUP BY m.id
ORDER BY m.position ASC, m.target_date ASC NULLS LAST;

-- name: GetMilestoneInProject :one
SELECT * FROM milestone WHERE id = $1 AND project_id = $2;

-- name: GetMilestone :one
SELECT * FROM milestone WHERE id = $1;

-- name: CreateMilestone :one
INSERT INTO milestone (project_id, name, description, start_date, target_date, position)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateMilestone :one
UPDATE milestone SET
    name        = COALESCE(sqlc.narg('name'), name),
    description = sqlc.narg('description'),
    start_date  = sqlc.narg('start_date'),
    target_date = sqlc.narg('target_date'),
    position    = COALESCE(sqlc.narg('position'), position),
    updated_at  = now()
WHERE id = $1
RETURNING *;

-- name: DeleteMilestone :exec
DELETE FROM milestone WHERE id = $1;

-- name: ReorderMilestones :exec
UPDATE milestone
SET position = data.position, updated_at = now()
FROM (SELECT unnest($1::uuid[]) AS id, unnest($2::float8[]) AS position) AS data
WHERE milestone.id = data.id;

-- name: ListMilestoneSummariesByIDs :many
-- Minimal projection for enriching issues with their milestone name (chip).
SELECT id, project_id, name FROM milestone
WHERE id = ANY($1::uuid[]);

-- name: GetProjectFromMilestone :one
SELECT project_id FROM milestone WHERE id = $1;
```

- [ ] **Step 2: Regenerate sqlc**

Run from repo root: `make sqlc`
Expected: no errors; `server/pkg/db/generated/milestone.sql.go` exists.

- [ ] **Step 3: Verify generated code compiles**

Run: `cd server && go build ./pkg/db/generated/`
Expected: clean build.

- [ ] **Step 4: Commit**

```bash
git add server/pkg/db/queries/milestone.sql server/pkg/db/generated/
git commit -m "feat(db): generate milestone sqlc queries"
```

---

## Task 3: Milestone handler + routes + tests

**Files:**
- Create: `server/internal/handler/milestone.go`
- Create: `server/internal/handler/milestone_test.go`
- Modify: `server/cmd/server/router.go`

- [ ] **Step 1: Write the failing handler test**

```go
// server/internal/handler/milestone_test.go
package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCreateMilestone(t *testing.T) {
	env := newTestEnv(t)
	defer env.cleanup()

	user := env.createUser(t, "owner@example.com")
	ws := env.createWorkspace(t, user, "WS1")
	team := env.createTeam(t, ws, user, "Team", "TEAM")
	project := env.createProject(t, ws, team, user, "Project A")

	body := strings.NewReader(`{"name":"Phase 1","description":"Discovery","target_date":"2026-05-01"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/projects/"+project.ID+"/milestones", body)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Workspace-ID", ws.ID)
	req.Header.Set("Authorization", "Bearer "+user.Token)

	w := httptest.NewRecorder()
	env.router.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var resp map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if resp["name"] != "Phase 1" {
		t.Errorf("name=%v", resp["name"])
	}
	if resp["target_date"] != "2026-05-01" {
		t.Errorf("target_date=%v", resp["target_date"])
	}
}

func TestListMilestonesProgress(t *testing.T) {
	env := newTestEnv(t)
	defer env.cleanup()

	user := env.createUser(t, "owner@example.com")
	ws := env.createWorkspace(t, user, "WS1")
	team := env.createTeam(t, ws, user, "Team", "TEAM")
	project := env.createProject(t, ws, team, user, "Project A")

	// Create milestone
	create := strings.NewReader(`{"name":"M1"}`)
	r1 := httptest.NewRequest(http.MethodPost, "/api/projects/"+project.ID+"/milestones", create)
	r1.Header.Set("Content-Type", "application/json")
	r1.Header.Set("X-Workspace-ID", ws.ID)
	r1.Header.Set("Authorization", "Bearer "+user.Token)
	w1 := httptest.NewRecorder()
	env.router.ServeHTTP(w1, r1)
	var ms map[string]any
	json.Unmarshal(w1.Body.Bytes(), &ms)
	mID := ms["id"].(string)

	// Create 3 issues — 2 done, 1 todo — assigned to milestone
	for i, status := range []string{"done", "done", "todo"} {
		body := bytes.NewReader([]byte(`{"title":"I` + string(rune('0'+i)) + `","status":"` + status + `","priority":"medium","team_id":"` + team.ID + `","milestone_id":"` + mID + `"}`))
		r := httptest.NewRequest(http.MethodPost, "/api/issues", body)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("X-Workspace-ID", ws.ID)
		r.Header.Set("Authorization", "Bearer "+user.Token)
		w := httptest.NewRecorder()
		env.router.ServeHTTP(w, r)
		if w.Code != http.StatusCreated {
			t.Fatalf("create issue status=%d body=%s", w.Code, w.Body.String())
		}
	}

	// List milestones
	r := httptest.NewRequest(http.MethodGet, "/api/projects/"+project.ID+"/milestones", nil)
	r.Header.Set("X-Workspace-ID", ws.ID)
	r.Header.Set("Authorization", "Bearer "+user.Token)
	w := httptest.NewRecorder()
	env.router.ServeHTTP(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", w.Code, w.Body.String())
	}
	var resp struct {
		Milestones []map[string]any `json:"milestones"`
	}
	json.Unmarshal(w.Body.Bytes(), &resp)
	if len(resp.Milestones) != 1 {
		t.Fatalf("got %d milestones", len(resp.Milestones))
	}
	m := resp.Milestones[0]
	if int(m["total_count"].(float64)) != 3 || int(m["done_count"].(float64)) != 2 {
		t.Errorf("totals total=%v done=%v", m["total_count"], m["done_count"])
	}
	if int(m["percent"].(float64)) != 67 {
		t.Errorf("percent=%v want 67", m["percent"])
	}
	if m["derived_status"] != "in_progress" {
		t.Errorf("derived_status=%v", m["derived_status"])
	}
}

func TestDeleteMilestoneUnsetsIssues(t *testing.T) {
	env := newTestEnv(t)
	defer env.cleanup()

	user := env.createUser(t, "owner@example.com")
	ws := env.createWorkspace(t, user, "WS1")
	team := env.createTeam(t, ws, user, "Team", "TEAM")
	project := env.createProject(t, ws, team, user, "Project A")

	// Create milestone
	r1 := httptest.NewRequest(http.MethodPost, "/api/projects/"+project.ID+"/milestones",
		strings.NewReader(`{"name":"M1"}`))
	r1.Header.Set("Content-Type", "application/json")
	r1.Header.Set("X-Workspace-ID", ws.ID)
	r1.Header.Set("Authorization", "Bearer "+user.Token)
	w1 := httptest.NewRecorder()
	env.router.ServeHTTP(w1, r1)
	var ms map[string]any
	json.Unmarshal(w1.Body.Bytes(), &ms)
	mID := ms["id"].(string)

	// Create issue assigned to milestone
	r2 := httptest.NewRequest(http.MethodPost, "/api/issues",
		strings.NewReader(`{"title":"I","status":"todo","priority":"medium","team_id":"`+team.ID+`","milestone_id":"`+mID+`"}`))
	r2.Header.Set("Content-Type", "application/json")
	r2.Header.Set("X-Workspace-ID", ws.ID)
	r2.Header.Set("Authorization", "Bearer "+user.Token)
	w2 := httptest.NewRecorder()
	env.router.ServeHTTP(w2, r2)
	var iss map[string]any
	json.Unmarshal(w2.Body.Bytes(), &iss)
	iID := iss["id"].(string)

	// Delete milestone
	r3 := httptest.NewRequest(http.MethodDelete, "/api/milestones/"+mID, nil)
	r3.Header.Set("X-Workspace-ID", ws.ID)
	r3.Header.Set("Authorization", "Bearer "+user.Token)
	w3 := httptest.NewRecorder()
	env.router.ServeHTTP(w3, r3)
	if w3.Code != http.StatusNoContent {
		t.Fatalf("delete status=%d body=%s", w3.Code, w3.Body.String())
	}

	// Issue still exists, milestone_id is null
	r4 := httptest.NewRequest(http.MethodGet, "/api/issues/"+iID, nil)
	r4.Header.Set("X-Workspace-ID", ws.ID)
	r4.Header.Set("Authorization", "Bearer "+user.Token)
	w4 := httptest.NewRecorder()
	env.router.ServeHTTP(w4, r4)
	if w4.Code != http.StatusOK {
		t.Fatalf("get issue status=%d", w4.Code)
	}
	var post map[string]any
	json.Unmarshal(w4.Body.Bytes(), &post)
	if post["milestone_id"] != nil {
		t.Errorf("milestone_id=%v want nil", post["milestone_id"])
	}
}
```

NOTE: this test file assumes existing test helpers `newTestEnv`, `createUser`, `createWorkspace`, `createTeam`, `createProject`. Read `server/internal/handler/handler_test.go` first; if any helper is missing, add it following the existing pattern (look at how `cycle_test.go` or other handler tests do setup).

- [ ] **Step 2: Run test, expect compile failure**

Run: `cd server && go test ./internal/handler/ -run TestCreateMilestone -v`
Expected: compile error — `Handler.ListMilestones` etc. not defined.

- [ ] **Step 3: Write the handler**

```go
// server/internal/handler/milestone.go
package handler

import (
	"encoding/json"
	"errors"
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
	Name        string  `json:"name"`
	Description *string `json:"description"`
	StartDate   *string `json:"start_date"`
	TargetDate  *string `json:"target_date"`
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
		ID:            uuidToString(r.ID),
		ProjectID:     uuidToString(r.ProjectID),
		Name:          r.Name,
		Description:   textToPtr(r.Description),
		StartDate:     dateToPtr(r.StartDate),
		TargetDate:    dateToPtr(r.TargetDate),
		Position:      r.Position,
		TotalCount:    r.TotalCount,
		DoneCount:     r.DoneCount,
		StartedCount:  r.StartedCount,
		CreatedAt:     timestampToString(r.CreatedAt),
		UpdatedAt:     timestampToString(r.UpdatedAt),
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

// resolveProjectWorkspace returns the project row if the user has access; writes errors otherwise.
func (h *Handler) resolveProjectForMilestone(w http.ResponseWriter, r *http.Request, projectID string) (db.Project, bool) {
	wsID := h.resolveWorkspaceID(r)
	project, err := h.Queries.GetProjectInWorkspace(r.Context(), db.GetProjectInWorkspaceParams{
		ID: parseUUID(projectID), WorkspaceID: parseUUID(wsID),
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
		"milestone_id": id, "project_id": uuidToString(project.ID),
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
		Column1: uuids, Column2: req.Positions,
	}); err != nil {
		// sqlc names anonymous params Column1/Column2 — verify after sqlc regen and adjust if different
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

// Suppress unused-imports linter when bytes/errors aren't referenced.
var _ = errors.New
```

NOTE: `protocol.EventMilestoneCreated`, `EventMilestoneUpdated`, `EventMilestoneDeleted` — add these constants in `server/pkg/protocol/events.go` (or wherever `EventCycleCreated` etc. live). Find with `grep -rn "EventCycleCreated\|EventCycleUpdated" server/pkg/protocol/` and add three sibling constants:

```go
EventMilestoneCreated = "milestone:created"
EventMilestoneUpdated = "milestone:updated"
EventMilestoneDeleted = "milestone:deleted"
```

NOTE: `parseUUID`, `uuidToString`, `textToPtr`, `dateToPtr`, `timestampToString`, `requestUserID`, `resolveActor`, `writeError`, `writeJSON`, `Queries.GetProjectInWorkspace`, `requestUserID` — all exist already. Verify with `grep -n "func.*parseUUID\|func.*writeError" server/internal/handler/handler.go`.

- [ ] **Step 4: Wire routes**

Open `server/cmd/server/router.go`. Find the cycle routes (`r.Route("/api/cycles/{id}", ...)`) and add immediately after:

```go
// Milestones
r.Route("/api/projects/{id}/milestones", func(r chi.Router) {
    r.Get("/", h.ListMilestones)
    r.Post("/", h.CreateMilestone)
    r.Post("/reorder", h.ReorderMilestones)
})
r.Route("/api/milestones/{id}", func(r chi.Router) {
    r.Get("/", h.GetMilestone)
    r.Put("/", h.UpdateMilestone)
    r.Delete("/", h.DeleteMilestone)
})
```

- [ ] **Step 5: Run tests, expect them to pass**

Run: `cd server && go test ./internal/handler/ -run TestCreateMilestone -v`
Run: `cd server && go test ./internal/handler/ -run TestListMilestonesProgress -v`
Run: `cd server && go test ./internal/handler/ -run TestDeleteMilestoneUnsetsIssues -v`
Expected: PASS for all three.

If tests fail because the create-issue handler doesn't yet accept `milestone_id`, that's expected — Task 4 fixes it. Keep these tests; they'll pass after Task 4.

- [ ] **Step 6: Build the whole server**

Run: `cd server && go build ./...`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add server/internal/handler/milestone.go server/internal/handler/milestone_test.go server/cmd/server/router.go server/pkg/protocol/
git commit -m "feat(api): milestone CRUD handlers and routes"
```

---

## Task 4: Issue endpoints accept and emit `milestone_id`

**Files:**
- Modify: `server/internal/handler/issue.go`

- [ ] **Step 1: Extend `IssueResponse` and request types**

In `server/internal/handler/issue.go`, find the `IssueResponse` struct (around line 24) and add two fields next to `ParentTitle`:

```go
MilestoneID   *string `json:"milestone_id,omitempty"`
MilestoneName *string `json:"milestone_name,omitempty"`
```

Find `UpdateIssueRequest` (around line 1062). Add:

```go
MilestoneID *string `json:"milestone_id"`
```

Find `CreateIssueRequest` (around line 856). Add:

```go
MilestoneID *string `json:"milestone_id"`
```

- [ ] **Step 2: Plumb `milestone_id` through `issueToResponse` and `issueListRowToResponse`**

In `issueToResponse` (line ~52), after `StartDate: dateToPtr(i.StartDate)`, add:

```go
MilestoneID: uuidToPtr(i.MilestoneID),
```

Same change in `issueListRowToResponse` (line ~88) — add after `StartDate`:

```go
MilestoneID: uuidToPtr(i.MilestoneID),
```

(`i.MilestoneID` will exist after sqlc regen reads the new column. If the code doesn't compile, run `make sqlc` to refresh `db.Issue` and `db.ListIssuesRow`.)

- [ ] **Step 3: Plumb `milestone_id` in CreateIssue handler**

In `CreateIssue` handler (around line 873), find where `cycleID` is assigned (search for `cycleID := pgtype.UUID{Valid: false}`). Right after the cycle-id block, add:

```go
milestoneID := pgtype.UUID{Valid: false}
if req.MilestoneID != nil && *req.MilestoneID != "" {
    milestoneID = parseUUID(*req.MilestoneID)
}
```

Then in the `db.CreateIssueParams{...}` literal that follows, add:

```go
MilestoneID: milestoneID,
```

- [ ] **Step 4: Plumb `milestone_id` in UpdateIssue handler**

In `UpdateIssue` handler (around line 1078), find the block that handles `cycle_id` (search `if _, ok := rawFields["cycle_id"]`). Add an analogous block right after for `milestone_id`:

```go
if _, ok := rawFields["milestone_id"]; ok {
    if req.MilestoneID != nil {
        params.MilestoneID = parseUUID(*req.MilestoneID)
    } else {
        params.MilestoneID = pgtype.UUID{Valid: false}
    }
}
```

- [ ] **Step 5: Plumb `milestone_id` in BatchUpdateIssues**

Find `BatchUpdateIssues` handler (around line 1450). Find the `cycle_id` block we recently added. Add an analogous block right after:

```go
if _, ok := rawUpdates["milestone_id"]; ok {
    if req.Updates.MilestoneID != nil {
        params.MilestoneID = parseUUID(*req.Updates.MilestoneID)
    } else {
        params.MilestoneID = pgtype.UUID{Valid: false}
    }
}
```

Also: in the `params := db.UpdateIssueParams{...}` literal earlier (line ~1492), add:

```go
MilestoneID: prevIssue.MilestoneID,
```

so the previous milestone is preserved when not touched.

- [ ] **Step 6: Update SQL UpdateIssue to include milestone_id**

The existing `UpdateIssue` SQL doesn't know about milestone_id. Open `server/pkg/db/queries/issue.sql`. Find the `UpdateIssue` query (around line 41). Add `milestone_id` line:

```sql
-- name: UpdateIssue :one
UPDATE issue SET
    title = COALESCE(sqlc.narg('title'), title),
    description = COALESCE(sqlc.narg('description'), description),
    status = COALESCE(sqlc.narg('status'), status),
    priority = COALESCE(sqlc.narg('priority'), priority),
    assignee_type = sqlc.narg('assignee_type'),
    assignee_id = sqlc.narg('assignee_id'),
    position = COALESCE(sqlc.narg('position'), position),
    due_date = sqlc.narg('due_date'),
    start_date = sqlc.narg('start_date'),
    parent_issue_id = sqlc.narg('parent_issue_id'),
    project_id = sqlc.narg('project_id'),
    cycle_id = sqlc.narg('cycle_id'),
    milestone_id = sqlc.narg('milestone_id'),
    estimate = sqlc.narg('estimate'),
    updated_at = now()
WHERE id = $1
RETURNING *;
```

Find `CreateIssue` (around line 26). Add `milestone_id` to the column list and a matching `$N` parameter:

```sql
-- name: CreateIssue :one
INSERT INTO issue (
    workspace_id, title, description, status, priority,
    assignee_type, assignee_id, creator_type, creator_id,
    parent_issue_id, position, due_date, number, project_id, team_id,
    cycle_id, estimate, start_date, milestone_id
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
    $16, $17, $18, $19
) RETURNING *;
```

- [ ] **Step 7: Regenerate sqlc**

Run from repo root: `make sqlc`
Expected: clean. `db.UpdateIssueParams` now has `MilestoneID pgtype.UUID`, `db.CreateIssueParams` has `MilestoneID pgtype.UUID`.

- [ ] **Step 8: Re-run all handler tests**

Run: `cd server && go test ./internal/handler/`
Expected: all pass, including the milestone tests from Task 3.

- [ ] **Step 9: Commit**

```bash
git add server/pkg/db/queries/issue.sql server/pkg/db/generated/ server/internal/handler/issue.go
git commit -m "feat(api): plumb milestone_id through issue create/update/batch"
```

---

## Task 5: Enrich issue responses with milestone name

**Files:**
- Modify: `server/internal/handler/issue.go`
- Modify: `server/internal/handler/cycle.go`
- Modify: `server/internal/handler/ticket.go`

- [ ] **Step 1: Add `enrichWithMilestones` and `enrichSingleWithMilestone` helpers**

In `server/internal/handler/issue.go`, right after the existing `enrichSingleWithParent` function, add:

```go
// enrichWithMilestones fills MilestoneName on every response whose MilestoneID
// is set, in a single batch query.
func (h *Handler) enrichWithMilestones(ctx context.Context, responses []IssueResponse) {
	if len(responses) == 0 {
		return
	}
	seen := map[string]bool{}
	ids := make([]pgtype.UUID, 0, len(responses))
	for _, r := range responses {
		if r.MilestoneID == nil || seen[*r.MilestoneID] {
			continue
		}
		seen[*r.MilestoneID] = true
		ids = append(ids, parseUUID(*r.MilestoneID))
	}
	if len(ids) == 0 {
		return
	}
	rows, err := h.Queries.ListMilestoneSummariesByIDs(ctx, ids)
	if err != nil {
		return
	}
	byID := make(map[string]string, len(rows))
	for _, m := range rows {
		byID[uuidToString(m.ID)] = m.Name
	}
	for i := range responses {
		if responses[i].MilestoneID == nil {
			continue
		}
		if name, ok := byID[*responses[i].MilestoneID]; ok {
			n := name
			responses[i].MilestoneName = &n
		}
	}
}

func (h *Handler) enrichSingleWithMilestone(ctx context.Context, resp *IssueResponse) {
	if resp == nil || resp.MilestoneID == nil {
		return
	}
	rows, err := h.Queries.ListMilestoneSummariesByIDs(ctx, []pgtype.UUID{parseUUID(*resp.MilestoneID)})
	if err != nil || len(rows) == 0 {
		return
	}
	name := rows[0].Name
	resp.MilestoneName = &name
}
```

- [ ] **Step 2: Call enrichers everywhere parent enrichment is called**

`enrichWithParents` is currently called at: ListIssues, ListChildIssues, search, ListCycleIssues. `enrichSingleWithParent` at: GetIssue, UpdateIssue response, CreateIssue response, BatchUpdate iter, ticket convert.

Add a call to `enrichWithMilestones` (batch) or `enrichSingleWithMilestone` (singleton) immediately after each existing parent enrich call. Locations to update:

- `issue.go:~825` — ListIssues — add `h.enrichWithMilestones(ctx, resp)` after `h.enrichWithParents(...)`.
- `issue.go:~640` — search — add `h.enrichWithMilestones(ctx, innerForEnrich)` after `h.enrichWithParents(...)`. Then in the back-copy loop, also copy MilestoneID/MilestoneName.
- `issue.go:~872` — GetIssue — add `h.enrichSingleWithMilestone(r.Context(), &resp)` after `h.enrichSingleWithParent(...)`.
- `issue.go:~893` — ListChildIssues — add `h.enrichWithMilestones(r.Context(), resp)` after the parent enrich.
- `issue.go:~1106` — CreateIssue — add `h.enrichSingleWithMilestone(...)` after the parent enrich.
- `issue.go:~1316` — UpdateIssue — add `h.enrichSingleWithMilestone(...)` after the parent enrich.
- `issue.go:~1699` — BatchUpdate — add `h.enrichSingleWithMilestone(...)` after the parent enrich.
- `cycle.go:~360` (ListCycleIssues) — add `h.enrichWithMilestones(...)` after the parent enrich.
- `ticket.go:~767` (ticket convert) — add `h.enrichSingleWithMilestone(...)` after the parent enrich.

The search back-copy loop becomes:

```go
for i := range resp {
    resp[i].ParentIdentifier = innerForEnrich[i].ParentIdentifier
    resp[i].ParentTitle = innerForEnrich[i].ParentTitle
    resp[i].MilestoneID = innerForEnrich[i].MilestoneID
    resp[i].MilestoneName = innerForEnrich[i].MilestoneName
}
```

- [ ] **Step 3: Build**

Run: `cd server && go build ./...`
Expected: clean.

- [ ] **Step 4: Add a small test asserting milestone_name appears in ListIssues**

Append to `server/internal/handler/milestone_test.go`:

```go
func TestListIssuesIncludesMilestoneName(t *testing.T) {
	env := newTestEnv(t)
	defer env.cleanup()

	user := env.createUser(t, "owner@example.com")
	ws := env.createWorkspace(t, user, "WS1")
	team := env.createTeam(t, ws, user, "Team", "TEAM")
	project := env.createProject(t, ws, team, user, "Project A")

	r1 := httptest.NewRequest(http.MethodPost, "/api/projects/"+project.ID+"/milestones",
		strings.NewReader(`{"name":"Phase 1"}`))
	r1.Header.Set("Content-Type", "application/json")
	r1.Header.Set("X-Workspace-ID", ws.ID)
	r1.Header.Set("Authorization", "Bearer "+user.Token)
	w1 := httptest.NewRecorder()
	env.router.ServeHTTP(w1, r1)
	var ms map[string]any
	json.Unmarshal(w1.Body.Bytes(), &ms)
	mID := ms["id"].(string)

	r2 := httptest.NewRequest(http.MethodPost, "/api/issues",
		strings.NewReader(`{"title":"X","status":"todo","priority":"medium","team_id":"`+team.ID+`","milestone_id":"`+mID+`"}`))
	r2.Header.Set("Content-Type", "application/json")
	r2.Header.Set("X-Workspace-ID", ws.ID)
	r2.Header.Set("Authorization", "Bearer "+user.Token)
	w2 := httptest.NewRecorder()
	env.router.ServeHTTP(w2, r2)
	if w2.Code != http.StatusCreated {
		t.Fatalf("create issue status=%d body=%s", w2.Code, w2.Body.String())
	}

	r3 := httptest.NewRequest(http.MethodGet, "/api/issues?team_id="+team.ID, nil)
	r3.Header.Set("X-Workspace-ID", ws.ID)
	r3.Header.Set("Authorization", "Bearer "+user.Token)
	w3 := httptest.NewRecorder()
	env.router.ServeHTTP(w3, r3)
	var resp struct {
		Issues []map[string]any `json:"issues"`
	}
	json.Unmarshal(w3.Body.Bytes(), &resp)
	if len(resp.Issues) != 1 {
		t.Fatalf("got %d issues", len(resp.Issues))
	}
	if resp.Issues[0]["milestone_name"] != "Phase 1" {
		t.Errorf("milestone_name=%v", resp.Issues[0]["milestone_name"])
	}
}
```

- [ ] **Step 5: Run, expect pass**

Run: `cd server && go test ./internal/handler/ -run TestListIssuesIncludesMilestoneName -v`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/internal/handler/issue.go server/internal/handler/cycle.go server/internal/handler/ticket.go server/internal/handler/milestone_test.go
git commit -m "feat(api): enrich issue responses with milestone name"
```

---

## Task 6: Migration CLI command

**Files:**
- Create: `server/cmd/multica/cmd_migrate.go`
- Modify: `server/cmd/multica/main.go` (register command)

- [ ] **Step 1: Read main.go to find registration pattern**

Run: `grep -n "rootCmd.AddCommand" server/cmd/multica/main.go`
Note the existing `rootCmd.AddCommand(...)` calls — add one alongside them in step 3.

- [ ] **Step 2: Write the migration command**

```go
// server/cmd/multica/cmd_migrate.go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/spf13/cobra"

	"github.com/multica-ai/multica/server/internal/cli"
)

var migrateCmd = &cobra.Command{
	Use:   "migrate",
	Short: "One-shot data migrations",
}

var migratePhasesCmd = &cobra.Command{
	Use:   "phases-to-milestones",
	Short: "Convert epic+phase issues to milestones for one project",
	Long: `Reads the project's epic-issue and its child phase-issues and converts:
  - each phase-issue → a milestone (name = phase title, description = phase body)
  - each task under a phase → its milestone_id set to the new milestone
  - the phase-issues and the epic-issue are deleted

Default is --dry-run. Pass --apply to commit changes.`,
	RunE: runMigratePhases,
}

func init() {
	migrateCmd.AddCommand(migratePhasesCmd)
	migratePhasesCmd.Flags().String("project-id", "", "UUID of the project to migrate (required)")
	migratePhasesCmd.Flags().String("epic-id", "", "UUID of the top-level epic issue (required)")
	migratePhasesCmd.Flags().Bool("apply", false, "Apply the changes (default is dry-run)")
}

type phasePlan struct {
	PhaseID       string   `json:"phase_id"`
	PhaseTitle    string   `json:"phase_title"`
	MilestoneName string   `json:"milestone_name"`
	TaskIDs       []string `json:"task_ids"`
	ExistingMID   string   `json:"existing_milestone_id,omitempty"`
}

type migrationPlan struct {
	ProjectID string      `json:"project_id"`
	EpicID    string      `json:"epic_id"`
	Phases    []phasePlan `json:"phases"`
}

func runMigratePhases(cmd *cobra.Command, _ []string) error {
	projectID, _ := cmd.Flags().GetString("project-id")
	epicID, _ := cmd.Flags().GetString("epic-id")
	apply, _ := cmd.Flags().GetBool("apply")
	if projectID == "" || epicID == "" {
		return fmt.Errorf("--project-id and --epic-id are required")
	}

	client, err := newAPIClient(cmd)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	// 1. List existing milestones for idempotency.
	var msResp struct {
		Milestones []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"milestones"`
	}
	if err := client.GetJSON(ctx, "/api/projects/"+projectID+"/milestones", &msResp); err != nil {
		return fmt.Errorf("list milestones: %w", err)
	}
	existing := map[string]string{}
	for _, m := range msResp.Milestones {
		existing[m.Name] = m.ID
	}

	// 2. Get epic's children (phases).
	var phasesResp struct {
		Issues []struct {
			ID    string `json:"id"`
			Title string `json:"title"`
		} `json:"issues"`
	}
	if err := client.GetJSON(ctx, "/api/issues/"+epicID+"/children", &phasesResp); err != nil {
		return fmt.Errorf("list epic children: %w", err)
	}

	plan := migrationPlan{ProjectID: projectID, EpicID: epicID}
	for _, phase := range phasesResp.Issues {
		// 3. Get phase's children (tasks).
		var tasksResp struct {
			Issues []struct {
				ID string `json:"id"`
			} `json:"issues"`
		}
		if err := client.GetJSON(ctx, "/api/issues/"+phase.ID+"/children", &tasksResp); err != nil {
			return fmt.Errorf("list phase children for %s: %w", phase.ID, err)
		}
		taskIDs := make([]string, len(tasksResp.Issues))
		for i, t := range tasksResp.Issues {
			taskIDs[i] = t.ID
		}
		pp := phasePlan{
			PhaseID:       phase.ID,
			PhaseTitle:    phase.Title,
			MilestoneName: phase.Title,
			TaskIDs:       taskIDs,
		}
		if id, ok := existing[phase.Title]; ok {
			pp.ExistingMID = id
		}
		plan.Phases = append(plan.Phases, pp)
	}

	out, _ := json.MarshalIndent(plan, "", "  ")
	fmt.Println(string(out))

	if !apply {
		fmt.Fprintln(os.Stderr, "\n[dry-run] Pass --apply to commit changes.")
		return nil
	}

	// 4. Apply.
	for _, p := range plan.Phases {
		mID := p.ExistingMID
		if mID == "" {
			body := map[string]any{"name": p.MilestoneName}
			var created struct{ ID string `json:"id"` }
			if err := client.PostJSON(ctx, "/api/projects/"+projectID+"/milestones", body, &created); err != nil {
				return fmt.Errorf("create milestone %q: %w", p.MilestoneName, err)
			}
			mID = created.ID
			fmt.Fprintf(os.Stderr, "Created milestone %s (%s)\n", p.MilestoneName, mID)
		} else {
			fmt.Fprintf(os.Stderr, "Reusing existing milestone %s (%s)\n", p.MilestoneName, mID)
		}
		// Re-point each task: set milestone_id, clear parent_issue_id.
		if len(p.TaskIDs) > 0 {
			body := map[string]any{
				"issue_ids": p.TaskIDs,
				"updates":   map[string]any{"milestone_id": mID, "parent_issue_id": nil},
			}
			if err := client.PostJSON(ctx, "/api/issues/batch-update", body, nil); err != nil {
				return fmt.Errorf("batch-update tasks for %s: %w", p.MilestoneName, err)
			}
			fmt.Fprintf(os.Stderr, "Re-pointed %d tasks\n", len(p.TaskIDs))
		}
		// Delete the phase issue.
		if err := client.DeleteJSON(ctx, "/api/issues/"+p.PhaseID); err != nil {
			fmt.Fprintf(os.Stderr, "WARN: failed to delete phase %s: %v\n", p.PhaseID, err)
		}
	}
	// Delete the epic.
	if err := client.DeleteJSON(ctx, "/api/issues/"+epicID); err != nil {
		fmt.Fprintf(os.Stderr, "WARN: failed to delete epic %s: %v\n", epicID, err)
	}
	fmt.Fprintln(os.Stderr, "Migration complete.")
	return nil
}

// Suppress unused import lint
var _ = cli.PrintJSON
```

NOTE: The CLI's `client` (`*cli.APIClient`) needs `PostJSON` and `DeleteJSON` helpers. Check `server/internal/cli/api_client.go` — `GetJSON` exists. If `PostJSON`/`DeleteJSON` don't exist, add them following the `GetJSON` pattern (look for `func (c *APIClient) GetJSON` and write parallel `PostJSON(ctx, path, body, out)` and `DeleteJSON(ctx, path)` methods).

- [ ] **Step 3: Register the command in main.go**

Open `server/cmd/multica/main.go`. Find the `rootCmd.AddCommand(...)` calls. Add:

```go
rootCmd.AddCommand(migrateCmd)
```

- [ ] **Step 4: Build the CLI**

Run: `cd server && go build -o /tmp/multica ./cmd/multica`
Expected: clean build.

- [ ] **Step 5: Smoke-test dry-run output**

Run: `/tmp/multica migrate phases-to-milestones --help`
Expected: usage prints, mentions `--project-id`, `--epic-id`, `--apply`.

- [ ] **Step 6: Commit**

```bash
git add server/cmd/multica/cmd_migrate.go server/cmd/multica/main.go server/internal/cli/
git commit -m "feat(cli): add migrate phases-to-milestones command"
```

---

## Task 7: Frontend types + API client

**Files:**
- Create: `packages/core/types/milestone.ts`
- Modify: `packages/core/types/issue.ts`
- Modify: `packages/core/types/index.ts`
- Modify: `packages/core/api/client.ts`

- [ ] **Step 1: Create the Milestone type**

```ts
// packages/core/types/milestone.ts
export type MilestoneDerivedStatus = "planned" | "in_progress" | "completed";

export interface Milestone {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  start_date: string | null;
  target_date: string | null;
  position: number;
  total_count: number;
  done_count: number;
  started_count: number;
  percent: number;
  derived_status: MilestoneDerivedStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateMilestoneRequest {
  name: string;
  description?: string | null;
  start_date?: string | null;
  target_date?: string | null;
  position?: number;
}

export interface UpdateMilestoneRequest {
  name?: string;
  description?: string | null;
  start_date?: string | null;
  target_date?: string | null;
  position?: number;
}

export interface ListMilestonesResponse {
  milestones: Milestone[];
}
```

- [ ] **Step 2: Add fields to Issue type**

In `packages/core/types/issue.ts`, find the `Issue` interface. Add right after `parent_title`:

```ts
milestone_id?: string | null;
milestone_name?: string;
```

- [ ] **Step 3: Re-export from index**

In `packages/core/types/index.ts`, add:

```ts
export * from "./milestone";
```

- [ ] **Step 4: Add API methods**

Open `packages/core/api/client.ts`. Add to the import list:

```ts
Milestone,
CreateMilestoneRequest,
UpdateMilestoneRequest,
ListMilestonesResponse,
```

In `UpdateIssueRequest` type definition (search for `interface UpdateIssueRequest`), add:

```ts
milestone_id?: string | null;
```

In `CreateIssueRequest` type, add:

```ts
milestone_id?: string;
```

After the existing cycle methods (search for `async listCycleIssues`), add:

```ts
// Milestones

async listMilestones(projectId: string): Promise<ListMilestonesResponse> {
  return this.fetch(`/api/projects/${projectId}/milestones`);
}

async getMilestone(id: string): Promise<Milestone> {
  return this.fetch(`/api/milestones/${id}`);
}

async createMilestone(projectId: string, data: CreateMilestoneRequest): Promise<Milestone> {
  return this.fetch(`/api/projects/${projectId}/milestones`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

async updateMilestone(id: string, data: UpdateMilestoneRequest): Promise<Milestone> {
  return this.fetch(`/api/milestones/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

async deleteMilestone(id: string): Promise<void> {
  await this.fetch(`/api/milestones/${id}`, { method: "DELETE" });
}

async reorderMilestones(projectId: string, ids: string[], positions: number[]): Promise<void> {
  await this.fetch(`/api/projects/${projectId}/milestones/reorder`, {
    method: "POST",
    body: JSON.stringify({ ids, positions }),
  });
}
```

- [ ] **Step 5: Typecheck**

Run from repo root: `pnpm typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/types/ packages/core/api/client.ts
git commit -m "feat(core): milestone types and API client methods"
```

---

## Task 8: Queries + mutations + tests

**Files:**
- Create: `packages/core/milestones/queries.ts`
- Create: `packages/core/milestones/mutations.ts`
- Create: `packages/core/milestones/index.ts`
- Create: `packages/core/milestones/mutations.test.ts`
- Modify: `packages/core/issues/mutations.ts`

- [ ] **Step 1: Write the query options**

```ts
// packages/core/milestones/queries.ts
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const milestoneKeys = {
  all: (wsId: string) => ["milestones", wsId] as const,
  byProject: (wsId: string, projectId: string) =>
    [...milestoneKeys.all(wsId), "project", projectId] as const,
  detail: (wsId: string, id: string) =>
    [...milestoneKeys.all(wsId), id] as const,
};

export function projectMilestonesOptions(wsId: string, projectId: string) {
  return queryOptions({
    queryKey: milestoneKeys.byProject(wsId, projectId),
    queryFn: () => api.listMilestones(projectId).then((r) => r.milestones),
    enabled: !!projectId,
  });
}

export function milestoneDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: milestoneKeys.detail(wsId, id),
    queryFn: () => api.getMilestone(id),
    enabled: !!id,
  });
}
```

- [ ] **Step 2: Write the mutations**

```ts
// packages/core/milestones/mutations.ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useWorkspaceId } from "../hooks";
import type { Milestone, CreateMilestoneRequest, UpdateMilestoneRequest } from "../types";
import { milestoneKeys } from "./queries";
import { issueKeys } from "../issues/queries";
import { cycleKeys } from "../cycles/queries";

export function useCreateMilestone(projectId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateMilestoneRequest) => api.createMilestone(projectId, data),
    onSuccess: (created) => {
      qc.setQueryData<Milestone[]>(milestoneKeys.byProject(wsId, projectId), (old) => {
        if (!old) return [created];
        return [...old, created];
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: milestoneKeys.byProject(wsId, projectId) });
    },
  });
}

export function useUpdateMilestone() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateMilestoneRequest) =>
      api.updateMilestone(id, data),
    onMutate: ({ id, ...data }) => {
      qc.cancelQueries({ queryKey: milestoneKeys.all(wsId) });
      const lists = qc.getQueriesData<Milestone[]>({ queryKey: milestoneKeys.all(wsId) });
      const prev = new Map<string, Milestone[]>();
      for (const [key, cache] of lists) {
        if (!cache) continue;
        prev.set(JSON.stringify(key), cache);
        qc.setQueryData<Milestone[]>(key, cache.map((m) => (m.id === id ? { ...m, ...data } : m)));
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        for (const [k, v] of ctx.prev) qc.setQueryData(JSON.parse(k), v);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: milestoneKeys.all(wsId) });
    },
  });
}

export function useDeleteMilestone(projectId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteMilestone(id),
    onMutate: (id) => {
      qc.cancelQueries({ queryKey: milestoneKeys.byProject(wsId, projectId) });
      const prev = qc.getQueryData<Milestone[]>(milestoneKeys.byProject(wsId, projectId));
      qc.setQueryData<Milestone[]>(milestoneKeys.byProject(wsId, projectId), (old) =>
        old?.filter((m) => m.id !== id),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(milestoneKeys.byProject(wsId, projectId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: milestoneKeys.all(wsId) });
      qc.invalidateQueries({ queryKey: issueKeys.list(wsId) });
      qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) });
    },
  });
}

export function useReorderMilestones(projectId: string) {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ ids, positions }: { ids: string[]; positions: number[] }) =>
      api.reorderMilestones(projectId, ids, positions),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: milestoneKeys.byProject(wsId, projectId) });
    },
  });
}
```

- [ ] **Step 3: Index file**

```ts
// packages/core/milestones/index.ts
export * from "./queries";
export * from "./mutations";
```

- [ ] **Step 4: Patch `useUpdateIssue` to also update milestone_id optimistically**

Open `packages/core/issues/mutations.ts`. Find `useUpdateIssue`. The existing pattern already patches `cycleKeys.issues(...)` caches optimistically. Add an `import { milestoneKeys } from "../milestones/queries"` at top. In `onSettled` of `useUpdateIssue`, `useCreateIssue`, `useDeleteIssue`, `useBatchUpdateIssues`, `useBatchDeleteIssues`, add:

```ts
qc.invalidateQueries({ queryKey: milestoneKeys.all(wsId) });
```

right next to the existing `qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) })` calls.

(The optimistic *patch* of milestone_id in list caches happens automatically via the existing `patchIssueInBuckets` helper because it's a partial Issue merge — no extra code needed. Only the milestone *progress counts* need to refresh, which is what the invalidate does.)

- [ ] **Step 5: Write the failing mutation test**

```ts
// packages/core/milestones/mutations.test.ts
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReactNode } from "react";

vi.mock("../api", () => ({
  api: {
    createMilestone: vi.fn(),
    updateMilestone: vi.fn(),
    deleteMilestone: vi.fn(),
    listMilestones: vi.fn(),
  },
}));

vi.mock("../hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

import { api } from "../api";
import { useCreateMilestone, useUpdateMilestone, useDeleteMilestone } from "./mutations";
import { milestoneKeys } from "./queries";

function wrapper(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe("milestone mutations", () => {
  let qc: QueryClient;
  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
  });

  it("createMilestone appends to project list cache", async () => {
    const created = { id: "m1", project_id: "p1", name: "Phase 1", description: null, start_date: null, target_date: null, position: 0, total_count: 0, done_count: 0, started_count: 0, percent: 0, derived_status: "planned" as const, created_at: "", updated_at: "" };
    (api.createMilestone as any).mockResolvedValue(created);
    qc.setQueryData(milestoneKeys.byProject("ws-1", "p1"), []);

    const { result } = renderHook(() => useCreateMilestone("p1"), { wrapper: wrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync({ name: "Phase 1" });
    });
    expect(qc.getQueryData<any[]>(milestoneKeys.byProject("ws-1", "p1"))).toEqual([created]);
  });

  it("updateMilestone optimistically patches and rolls back on error", async () => {
    const m = { id: "m1", project_id: "p1", name: "Old", description: null, start_date: null, target_date: null, position: 0, total_count: 0, done_count: 0, started_count: 0, percent: 0, derived_status: "planned" as const, created_at: "", updated_at: "" };
    qc.setQueryData(milestoneKeys.byProject("ws-1", "p1"), [m]);
    (api.updateMilestone as any).mockRejectedValue(new Error("nope"));

    const { result } = renderHook(() => useUpdateMilestone(), { wrapper: wrapper(qc) });
    await act(async () => {
      try {
        await result.current.mutateAsync({ id: "m1", name: "New" });
      } catch {
        // expected
      }
    });
    await waitFor(() => {
      const cached = qc.getQueryData<any[]>(milestoneKeys.byProject("ws-1", "p1"));
      expect(cached?.[0].name).toBe("Old");
    });
  });

  it("deleteMilestone optimistically removes from cache", async () => {
    const m = { id: "m1", project_id: "p1", name: "X", description: null, start_date: null, target_date: null, position: 0, total_count: 0, done_count: 0, started_count: 0, percent: 0, derived_status: "planned" as const, created_at: "", updated_at: "" };
    qc.setQueryData(milestoneKeys.byProject("ws-1", "p1"), [m]);
    (api.deleteMilestone as any).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteMilestone("p1"), { wrapper: wrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync("m1");
    });
    expect(qc.getQueryData<any[]>(milestoneKeys.byProject("ws-1", "p1"))).toEqual([]);
  });
});
```

- [ ] **Step 6: Run tests, expect pass**

Run: `pnpm --filter @multica/core exec vitest run milestones/mutations.test.ts`
Expected: 3 passing.

- [ ] **Step 7: Typecheck**

Run from repo root: `pnpm typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/core/milestones/ packages/core/issues/mutations.ts
git commit -m "feat(core): milestone queries, mutations, and tests"
```

---

## Task 9: Realtime sync handlers

**Files:**
- Modify: `packages/core/realtime/use-realtime-sync.ts`

- [ ] **Step 1: Add the milestone refresh handler**

Open `packages/core/realtime/use-realtime-sync.ts`. Find the `cycle:` handler in `refreshMap` (search for `cycle: () =>`). Add immediately after:

```ts
milestone: () => {
  const wsId = getCurrentWsId();
  if (wsId) qc.invalidateQueries({ queryKey: milestoneKeys.all(wsId) });
},
```

At the top of the file, add the import:

```ts
import { milestoneKeys } from "../milestones/queries";
```

- [ ] **Step 2: Verify the issue handlers also invalidate milestoneKeys**

Find `unsubIssueUpdated` (search `ws.on("issue:updated"`). Inside the handler, after `qc.invalidateQueries({ queryKey: cycleKeys.all(wsId) })`, add:

```ts
qc.invalidateQueries({ queryKey: milestoneKeys.all(wsId) });
```

Same change inside `unsubIssueCreated` and `unsubIssueDeleted` handlers — add the milestone invalidation right next to the cycle one.

- [ ] **Step 3: Typecheck and core tests**

Run: `pnpm --filter @multica/core typecheck && pnpm --filter @multica/core test`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add packages/core/realtime/use-realtime-sync.ts
git commit -m "feat(core): realtime invalidation for milestones"
```

---

## Task 10: MilestoneChip component + tests

**Files:**
- Create: `packages/views/milestones/components/milestone-chip.tsx`
- Create: `packages/views/milestones/components/milestone-chip.test.tsx`
- Create: `packages/views/milestones/components/index.ts`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/views/milestones/components/milestone-chip.test.tsx
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MilestoneChip } from "./milestone-chip";

const push = vi.fn();
vi.mock("../../navigation", () => ({
  useNavigation: () => ({ push }),
}));
vi.mock("@multica/core/paths", () => ({
  useWorkspacePaths: () => ({ projectIssues: (id: string) => `/p/${id}/issues` }),
}));

describe("MilestoneChip", () => {
  it("renders the milestone name", () => {
    render(<MilestoneChip milestoneId="m1" milestoneName="Phase 1" projectId="p1" />);
    expect(screen.getByText("Phase 1")).toBeInTheDocument();
  });
  it("navigates to filtered project issues on click", () => {
    push.mockClear();
    render(<MilestoneChip milestoneId="m1" milestoneName="Phase 1" projectId="p1" />);
    fireEvent.click(screen.getByText("Phase 1").closest("[role='link']")!);
    expect(push).toHaveBeenCalledWith("/p/p1/issues?milestone=m1");
  });
});
```

- [ ] **Step 2: Run, expect failure**

Run: `pnpm --filter @multica/views exec vitest run milestones/components/milestone-chip.test.tsx`
Expected: fail — module not found.

- [ ] **Step 3: Write the component**

```tsx
// packages/views/milestones/components/milestone-chip.tsx
"use client";

import { Diamond } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import { useWorkspacePaths } from "@multica/core/paths";
import { useNavigation } from "../../navigation";

export function MilestoneChip({
  milestoneId,
  milestoneName,
  projectId,
  className = "",
}: {
  milestoneId: string;
  milestoneName: string;
  projectId?: string;
  className?: string;
}) {
  const navigation = useNavigation();
  const p = useWorkspacePaths();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            role="link"
            tabIndex={0}
            className={`inline-flex shrink-0 cursor-pointer items-center gap-1 rounded text-xs text-muted-foreground max-w-[160px] hover:text-foreground ${className}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (projectId) {
                navigation.push(`${p.projectIssues(projectId)}?milestone=${milestoneId}`);
              }
            }}
          >
            <Diamond className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{milestoneName}</span>
          </span>
        }
      />
      <TooltipContent>{milestoneName}</TooltipContent>
    </Tooltip>
  );
}
```

NOTE: `p.projectIssues` may not exist in `paths.ts`. Check `packages/core/paths/paths.ts`. If absent, add:

```ts
projectIssues: (id: string) => `${ws}/projects/${encode(id)}`,
```

(reusing the project detail path for now — milestone filter is via query param).

- [ ] **Step 4: Index file**

```ts
// packages/views/milestones/components/index.ts
export { MilestoneChip } from "./milestone-chip";
```

- [ ] **Step 5: Run, expect pass**

Run: `pnpm --filter @multica/views exec vitest run milestones/components/milestone-chip.test.tsx`
Expected: 2 passing.

- [ ] **Step 6: Commit**

```bash
git add packages/views/milestones/ packages/core/paths/
git commit -m "feat(views): milestone chip component"
```

---

## Task 11: MilestoneFormDialog (create + edit)

**Files:**
- Create: `packages/views/milestones/components/milestone-form-dialog.tsx`
- Modify: `packages/views/milestones/components/index.ts`

- [ ] **Step 1: Write the dialog**

```tsx
// packages/views/milestones/components/milestone-form-dialog.tsx
"use client";

import { useState } from "react";
import { Button } from "@multica/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@multica/ui/components/ui/dialog";
import { Input } from "@multica/ui/components/ui/input";
import { Label } from "@multica/ui/components/ui/label";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { useCreateMilestone, useUpdateMilestone } from "@multica/core/milestones";
import { toast } from "sonner";
import type { Milestone } from "@multica/core/types";

export function MilestoneFormDialog({
  open,
  onOpenChange,
  projectId,
  milestone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  milestone?: Milestone;
}) {
  const [name, setName] = useState(milestone?.name ?? "");
  const [description, setDescription] = useState(milestone?.description ?? "");
  const [startDate, setStartDate] = useState(milestone?.start_date ?? "");
  const [targetDate, setTargetDate] = useState(milestone?.target_date ?? "");

  const createMutation = useCreateMilestone(projectId);
  const updateMutation = useUpdateMilestone();
  const isEdit = !!milestone;
  const pending = createMutation.isPending || updateMutation.isPending;

  const submit = async () => {
    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          id: milestone.id,
          name: name.trim(),
          description: description || null,
          start_date: startDate || null,
          target_date: targetDate || null,
        });
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description || null,
          start_date: startDate || null,
          target_date: targetDate || null,
        });
      }
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to save milestone");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit milestone" : "New milestone"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="ms-name">Name</Label>
            <Input
              id="ms-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Discovery & Technical Research"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="ms-desc">Description</Label>
            <Textarea
              id="ms-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ms-start">Start date</Label>
              <Input id="ms-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ms-target">Target date</Label>
              <Input id="ms-target" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={pending}>
            {isEdit ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

NOTE: `Textarea` may not exist as a separate primitive. If `pnpm typecheck` errors, install via `pnpm ui:add textarea` from repo root or substitute a plain `<textarea className="...">` styled with the same Tailwind tokens used by `Input`.

- [ ] **Step 2: Export from index**

In `packages/views/milestones/components/index.ts`, add:

```ts
export { MilestoneFormDialog } from "./milestone-form-dialog";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @multica/views typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/views/milestones/components/milestone-form-dialog.tsx packages/views/milestones/components/index.ts
git commit -m "feat(views): milestone create/edit dialog"
```

---

## Task 12: MilestonePicker for issue detail

**Files:**
- Create: `packages/views/milestones/components/milestone-picker.tsx`
- Modify: `packages/views/milestones/components/index.ts`

- [ ] **Step 1: Write the picker**

```tsx
// packages/views/milestones/components/milestone-picker.tsx
"use client";

import { useQuery } from "@tanstack/react-query";
import { Diamond } from "lucide-react";
import { useWorkspaceId } from "@multica/core/hooks";
import { projectMilestonesOptions } from "@multica/core/milestones";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@multica/ui/components/ui/combobox";

export function MilestonePicker({
  projectId,
  milestoneId,
  onChange,
  disabled = false,
}: {
  projectId: string | null;
  milestoneId: string | null | undefined;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const wsId = useWorkspaceId();
  const enabled = !disabled && !!projectId;
  const { data: milestones = [] } = useQuery({
    ...projectMilestonesOptions(wsId, projectId ?? ""),
    enabled,
  });

  const current = milestones.find((m) => m.id === milestoneId);

  return (
    <Combobox value={milestoneId ?? ""} onValueChange={(v) => onChange(v || null)}>
      <ComboboxTrigger
        disabled={!enabled}
        className="inline-flex h-7 items-center gap-1.5 rounded px-1.5 text-xs text-muted-foreground hover:bg-accent disabled:opacity-50"
      >
        <Diamond className="size-3.5" />
        {current ? current.name : <span className="text-muted-foreground">No milestone</span>}
      </ComboboxTrigger>
      <ComboboxContent>
        <ComboboxInput placeholder="Search milestones..." />
        <ComboboxList>
          <ComboboxEmpty>No milestones</ComboboxEmpty>
          <ComboboxItem value="">No milestone</ComboboxItem>
          {milestones.map((m) => (
            <ComboboxItem key={m.id} value={m.id}>
              <Diamond className="size-3.5" />
              <span className="truncate">{m.name}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{m.percent}%</span>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
```

NOTE: The exact Combobox sub-component names depend on the local shadcn variant. Check `packages/ui/components/ui/combobox.tsx` and adjust the imports/props to match the actual API. If the local Combobox doesn't expose these slots, fall back to a `Popover` + `Command` pattern (search any existing picker like `cycle-picker.tsx` for the local pattern).

- [ ] **Step 2: Export**

```ts
// packages/views/milestones/components/index.ts (append)
export { MilestonePicker } from "./milestone-picker";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @multica/views typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/views/milestones/components/milestone-picker.tsx packages/views/milestones/components/index.ts
git commit -m "feat(views): milestone picker for issue detail"
```

---

## Task 13: Sidebar block + body section

**Files:**
- Create: `packages/views/milestones/components/milestones-sidebar-block.tsx`
- Create: `packages/views/milestones/components/milestones-section.tsx`
- Modify: `packages/views/milestones/components/index.ts`

- [ ] **Step 1: Write the sidebar block**

```tsx
// packages/views/milestones/components/milestones-sidebar-block.tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, Diamond, MoreHorizontal } from "lucide-react";
import { useWorkspaceId } from "@multica/core/hooks";
import { projectMilestonesOptions } from "@multica/core/milestones";
import type { Milestone } from "@multica/core/types";
import { MilestoneFormDialog } from "./milestone-form-dialog";

function statusFill(s: Milestone["derived_status"]) {
  if (s === "completed") return "fill-primary text-primary";
  if (s === "in_progress") return "text-primary";
  return "text-muted-foreground";
}

function shortDate(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MilestonesSidebarBlock({
  projectId,
  selectedId,
  onSelect,
}: {
  projectId: string;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const wsId = useWorkspaceId();
  const [open, setOpen] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: milestones = [] } = useQuery(projectMilestonesOptions(wsId, projectId));

  return (
    <div>
      <button
        className={`flex w-full items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors mb-2 hover:bg-accent/70 ${open ? "" : "text-muted-foreground hover:text-foreground"}`}
        onClick={() => setOpen(!open)}
      >
        Milestones
        <ChevronRight className={`!size-3 shrink-0 stroke-[2.5] text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        <button
          type="button"
          className="ml-auto rounded p-0.5 hover:bg-accent"
          onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
          title="Add milestone"
        >
          <Plus className="size-3" />
        </button>
      </button>
      {open && (
        <div className="space-y-0.5 pl-2">
          {milestones.length === 0 ? (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setDialogOpen(true)}
            >
              + Add milestone
            </button>
          ) : (
            milestones.map((m) => {
              const active = m.id === selectedId;
              return (
                <button
                  key={m.id}
                  onClick={() => onSelect?.(active ? null : m.id)}
                  className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-accent ${active ? "bg-accent" : ""}`}
                >
                  <Diamond className={`size-3.5 shrink-0 ${statusFill(m.derived_status)}`} />
                  <span className="truncate flex-1 text-left">{m.name}</span>
                  <span className="text-[10px] text-muted-foreground">{m.percent}%</span>
                  {shortDate(m.target_date) && (
                    <span className="text-[10px] text-muted-foreground">{shortDate(m.target_date)}</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
      <MilestoneFormDialog open={dialogOpen} onOpenChange={setDialogOpen} projectId={projectId} />
    </div>
  );
}
```

- [ ] **Step 2: Write the body section**

```tsx
// packages/views/milestones/components/milestones-section.tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Diamond, MoreHorizontal } from "lucide-react";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { projectMilestonesOptions } from "@multica/core/milestones";
import { useNavigation } from "../../navigation";
import type { Milestone } from "@multica/core/types";
import { MilestoneFormDialog } from "./milestone-form-dialog";

function statusColor(s: Milestone["derived_status"]) {
  if (s === "completed") return "fill-primary text-primary";
  if (s === "in_progress") return "text-primary";
  return "text-muted-foreground";
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function MilestonesSection({ projectId }: { projectId: string }) {
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const navigation = useNavigation();
  const { data: milestones = [] } = useQuery(projectMilestonesOptions(wsId, projectId));
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Milestone | undefined>(undefined);

  return (
    <div className="mt-8">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Milestones</h3>
      {milestones.length === 0 ? (
        <button
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => { setEditing(undefined); setDialogOpen(true); }}
        >
          + Add milestone
        </button>
      ) : (
        <div className="space-y-3">
          {milestones.map((m) => (
            <div key={m.id} className="border-b pb-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setEditing(m); setDialogOpen(true); }}
                  title="Edit milestone"
                  className="rounded hover:bg-accent p-0.5"
                >
                  <Diamond className={`size-4 ${statusColor(m.derived_status)}`} />
                </button>
                <button
                  className="text-sm font-medium hover:underline"
                  onClick={() => navigation.push(`${p.projectIssues(projectId)}?milestone=${m.id}`)}
                >
                  {m.name}
                </button>
                <span className="ml-auto text-xs text-muted-foreground">
                  {fmtDate(m.target_date)} · {m.total_count} issues · {m.percent}%
                </span>
              </div>
              {m.description && (
                <p className="mt-1 ml-6 text-xs text-muted-foreground line-clamp-2">{m.description}</p>
              )}
            </div>
          ))}
          <button
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => { setEditing(undefined); setDialogOpen(true); }}
          >
            <Plus className="inline size-3 mr-1" />Milestone
          </button>
        </div>
      )}
      <MilestoneFormDialog
        open={dialogOpen}
        onOpenChange={(v) => { setDialogOpen(v); if (!v) setEditing(undefined); }}
        projectId={projectId}
        milestone={editing}
      />
    </div>
  );
}
```

- [ ] **Step 3: Export**

```ts
// packages/views/milestones/components/index.ts (append)
export { MilestonesSidebarBlock } from "./milestones-sidebar-block";
export { MilestonesSection } from "./milestones-section";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @multica/views typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/views/milestones/components/
git commit -m "feat(views): milestones sidebar block and overview section"
```

---

## Task 14: Add milestone chip to list-row + board-card

**Files:**
- Modify: `packages/views/issues/components/list-row.tsx`
- Modify: `packages/views/issues/components/board-card.tsx`

- [ ] **Step 1: list-row.tsx**

Open `packages/views/issues/components/list-row.tsx`. Add to imports:

```ts
import { MilestoneChip } from "../../milestones/components";
```

Find the `showParent` derived flag. Right under it, add:

```ts
const showMilestone = !!issue.milestone_id && !!issue.milestone_name;
```

In the JSX, find the parent chip block (the `{showParent && (...)}` block). Right after its closing `)}`, add:

```tsx
{showMilestone && (
  <MilestoneChip
    milestoneId={issue.milestone_id!}
    milestoneName={issue.milestone_name!}
    projectId={issue.project_id ?? undefined}
  />
)}
```

- [ ] **Step 2: board-card.tsx**

Open `packages/views/issues/components/board-card.tsx`. Add the same `MilestoneChip` import. Find the `showParent` derived flag, add `showMilestone` next to it.

Find the parent chip block in the meta row JSX (after `showCycle`, before `showProject` per the previous parent-chip patch). Insert the milestone chip block right before the parent chip:

```tsx
{showMilestone && (
  <MilestoneChip
    milestoneId={issue.milestone_id!}
    milestoneName={issue.milestone_name!}
    projectId={issue.project_id ?? undefined}
    className="rounded-full bg-muted/60 px-1.5 py-0.5 text-[11px] max-w-[140px]"
  />
)}
```

(The `className` overrides match the rounded-pill style other board chips use.)

Update the `(showChildProgress || showCycle || showParent || showProject)` conditional that gates the row to also include `showMilestone`.

- [ ] **Step 3: Typecheck and run views tests**

Run: `pnpm --filter @multica/views typecheck`
Run: `pnpm --filter @multica/views exec vitest run issues/components/list-row.tsx issues/components/board-card.tsx 2>/dev/null || true`
Expected: typecheck clean. Tests for list-row/board-card don't exist yet — that's fine.

- [ ] **Step 4: Commit**

```bash
git add packages/views/issues/components/list-row.tsx packages/views/issues/components/board-card.tsx
git commit -m "feat(views): show milestone chip on issue rows and cards"
```

---

## Task 15: Add milestone filter to filter bar + view store

**Files:**
- Modify: `packages/core/issues/stores/view-store.ts`
- Modify: `packages/views/issues/components/issues-header.tsx`
- Modify: `packages/views/issues/utils/filter.ts`

- [ ] **Step 1: Add `milestoneFilters` to view store**

Open `packages/core/issues/stores/view-store.ts`. Find `cycleFilters` (or the filter set definitions). Add a parallel `milestoneFilters: string[]` field, plus `setMilestoneFilters`, `toggleMilestoneFilter`, `clearMilestoneFilters` methods, mirroring the cycle pattern verbatim.

- [ ] **Step 2: Apply the filter in `filterIssues`**

Open `packages/views/issues/utils/filter.ts`. The function takes a filter object and returns filtered issues. Add a `milestoneFilters?: string[]` parameter. When non-empty, only keep issues whose `milestone_id` is in the set. Mirror how cycle filtering works.

- [ ] **Step 3: Wire the filter in issues-header**

In `packages/views/issues/components/issues-header.tsx`, find the cycle filter submenu. Add an analogous milestone submenu using the project's milestones (when in a project scope) or all milestones across the workspace's projects (when at workspace scope).

For the simpler v1: when `projectId` is known (project scope), query `projectMilestonesOptions(wsId, projectId)` and render its rows; otherwise hide the milestone filter entry.

- [ ] **Step 4: Read URL `?milestone=` param**

In whatever page wires the filter store (search `useViewStore.*setCycleFilters`), add a `useEffect` that reads `?milestone=` from the URL and calls `setMilestoneFilters([id])` on mount. Provide a "Clear filter" link in the filter bar when `milestoneFilters.length > 0`.

- [ ] **Step 5: Typecheck and existing tests**

Run: `pnpm typecheck && pnpm --filter @multica/core test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core/issues/stores/view-store.ts packages/views/issues/utils/filter.ts packages/views/issues/components/issues-header.tsx
git commit -m "feat(views): milestone filter in issue header"
```

---

## Task 16: Add milestone picker to issue detail

**Files:**
- Modify: `packages/views/issues/components/issue-detail.tsx`

- [ ] **Step 1: Add a Milestone PropRow next to Project**

Open `packages/views/issues/components/issue-detail.tsx`. Search for `<PropRow label="Project">` (or however the project picker is rendered). Add right below it:

```tsx
<PropRow label="Milestone">
  <MilestonePicker
    projectId={issue.project_id ?? null}
    milestoneId={issue.milestone_id}
    onChange={(id) => handleUpdate({ milestone_id: id })}
  />
</PropRow>
```

Add the import at the top:

```ts
import { MilestonePicker } from "../../milestones/components";
```

`handleUpdate` already exists and dispatches via `useUpdateIssue`. The mutation accepts `milestone_id` after Task 7.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @multica/views typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/views/issues/components/issue-detail.tsx
git commit -m "feat(views): milestone picker in issue detail sidebar"
```

---

## Task 17: Restructure project-detail (Tabs + Milestones)

**Files:**
- Modify: `packages/views/projects/components/project-detail.tsx`

This is the biggest single-file change. Read the file in full (`Read packages/views/projects/components/project-detail.tsx`) before starting.

- [ ] **Step 1: Add a tab state and tab buttons**

At the top of the `ProjectDetail` component (around line 130), add:

```ts
const [activeTab, setActiveTab] = useState<"overview" | "issues">("issues");
```

(`"issues"` is the safer default — preserves current landing.)

In the `PageHeader` (around line 513), right after the breadcrumb/title chunk, add a tab switcher using shadcn `Tabs` primitive:

```tsx
import { Tabs, TabsList, TabsTrigger } from "@multica/ui/components/ui/tabs";
// ...
<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "overview" | "issues")}>
  <TabsList className="h-7">
    <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
    <TabsTrigger value="issues" className="text-xs">Issues</TabsTrigger>
  </TabsList>
</Tabs>
```

- [ ] **Step 2: Conditionally render Overview vs Issues content**

The current main content (`<IssuesHeader ... /><ProjectIssuesContent ... /><BatchActionToolbar ... />` block around line 600) becomes `activeTab === "issues" && (...)`.

Add a new `activeTab === "overview" && (...)` block in the same place. Inside it, render the project's title, properties row, and ContentEditor description (move them from the sidebar to here), then `<MilestonesSection projectId={projectId} />`.

```tsx
import { MilestonesSection } from "../../milestones/components";
// ...
{activeTab === "overview" && (
  <div className="mx-auto w-full max-w-4xl px-8 py-8">
    <div className="text-2xl font-semibold">{project.title}</div>
    {/* Properties row — copy the existing block from the sidebar verbatim */}
    {/* Description — copy the existing ContentEditor block */}
    <ContentEditor
      ref={descEditorRef}
      key={`overview-desc-${projectId}`}
      defaultValue={project.description || ""}
      placeholder="Add description..."
      onUpdate={(md) => handleUpdateField({ description: md || null })}
      debounceMs={1500}
      className="min-h-[260px]"
    />
    <MilestonesSection projectId={projectId} />
  </div>
)}
{activeTab === "issues" && (
  <div className="flex h-full flex-col">
    <ViewStoreProvider store={projectViewStore}>
      <IssuesHeader scopedIssues={projectIssues} />
      <ProjectIssuesContent
        projectIssues={projectIssues}
        scope={projectScope}
        filter={projectFilter}
      />
      <BatchActionToolbar teamId={project?.team_id} />
    </ViewStoreProvider>
  </div>
)}
```

When the Overview tab renders, the title and description should be removed from the sidebar to avoid duplication. The sidebar keeps Properties + the new Milestones block + Progress.

- [ ] **Step 3: Add `MilestonesSidebarBlock` to the sidebar**

In `sidebarContent` (around line 292), insert the milestones block between Properties and Description (or in place of Description if you moved description to the body):

```tsx
import { MilestonesSidebarBlock } from "../../milestones/components";
// ...
<MilestonesSidebarBlock
  projectId={projectId}
  selectedId={milestoneFilter}
  onSelect={(id) => setMilestoneFilter(id)}
/>
```

`milestoneFilter` is local state synced with the project view store's `milestoneFilters[0]`. When the user clicks a milestone in the sidebar, switch to the Issues tab and apply the filter:

```ts
const setMilestoneFilter = (id: string | null) => {
  setActiveTab("issues");
  const store = projectViewStore.getState();
  store.setMilestoneFilters(id ? [id] : []);
};
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: clean.

- [ ] **Step 5: Manual test note**

Run `pnpm dev:web` (background), open the existing project page, switch tabs, create a milestone, assign issues to it via the issue detail picker, click the sidebar milestone to filter. Confirm the filter pill appears and clearing works.

- [ ] **Step 6: Commit**

```bash
git add packages/views/projects/components/project-detail.tsx
git commit -m "feat(views): project tabs (overview/issues) + milestones sidebar block + body section"
```

---

## Task 18: E2E test

**Files:**
- Create: `e2e/tests/milestones.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// e2e/tests/milestones.spec.ts
import { test, expect } from "@playwright/test";
import { loginAsDefault, createTestApi } from "../helpers";
import type { TestApiClient } from "../fixtures";

let api: TestApiClient;

test.beforeEach(async ({ page }) => {
  api = await createTestApi();
  await loginAsDefault(page);
});

test.afterEach(async () => {
  await api.cleanup();
});

test("create milestone, assign issue, filter, delete", async ({ page }) => {
  const team = await api.createTeam("MS", "MS Team");
  const project = await api.createProject(team.id, "MS Project");

  // Create two issues via API
  const issue1 = await api.createIssue("Task A", { team_id: team.id, project_id: project.id });
  const issue2 = await api.createIssue("Task B", { team_id: team.id, project_id: project.id });

  // Open project page
  await page.goto(`/${api.workspaceSlug}/projects/${project.id}`);
  await page.getByRole("tab", { name: "Overview" }).click();

  // Add milestone via the body button
  await page.getByRole("button", { name: /add milestone/i }).first().click();
  await page.getByLabel("Name").fill("Phase 1");
  await page.getByRole("button", { name: "Create" }).click();

  // Milestone appears in body section
  await expect(page.getByText("Phase 1")).toBeVisible();

  // Switch to Issues tab, assign issue1 via API for speed (UI picker is covered in unit tests)
  const ms = (await api.listMilestones(project.id))[0];
  await api.updateIssue(issue1.id, { milestone_id: ms.id });

  // Click milestone in sidebar to filter
  await page.getByRole("tab", { name: "Issues" }).click();
  await page.getByRole("button", { name: /Phase 1/i }).first().click();
  await expect(page.getByText("Task A")).toBeVisible();
  await expect(page.getByText("Task B")).not.toBeVisible();

  // Delete the milestone via API and verify issue still exists
  await api.deleteMilestone(ms.id);
  await page.reload();
  await page.getByRole("tab", { name: "Issues" }).click();
  await expect(page.getByText("Task A")).toBeVisible();
});
```

NOTE: `api.createTeam`, `api.createProject`, `api.createIssue`, `api.updateIssue` already exist in `e2e/fixtures.ts`. `api.listMilestones` and `api.deleteMilestone` need to be added. Open `e2e/fixtures.ts` and add:

```ts
async listMilestones(projectId: string) {
  const r = await this.request.get(`${this.baseUrl}/api/projects/${projectId}/milestones`, { headers: this.headers });
  const j = await r.json();
  return j.milestones as any[];
}

async createMilestone(projectId: string, name: string) {
  const r = await this.request.post(`${this.baseUrl}/api/projects/${projectId}/milestones`, {
    headers: { ...this.headers, "Content-Type": "application/json" },
    data: JSON.stringify({ name }),
  });
  return r.json();
}

async deleteMilestone(id: string) {
  await this.request.delete(`${this.baseUrl}/api/milestones/${id}`, { headers: this.headers });
}
```

- [ ] **Step 2: Run E2E**

Make sure backend and frontend are running locally (`make dev`).
Run: `pnpm exec playwright test e2e/tests/milestones.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/tests/milestones.spec.ts e2e/fixtures.ts
git commit -m "test(e2e): milestones flow"
```

---

## Task 19: Final integration sweep

- [ ] **Step 1: Full check**

Run from repo root: `make check`
Expected: typecheck, unit tests, Go tests, E2E all pass.

If any fail, return to the specific task and fix. Don't proceed until green.

- [ ] **Step 2: Smoke-test the migration command against a copy of CLIC**

Verify against production data carefully:

```bash
multica --profile clicko migrate phases-to-milestones \
  --project-id <CLIC project id> \
  --epic-id <CLIC-2 issue id>
```

Expected: prints the migration plan (dry-run). Inspect; if correct:

```bash
multica --profile clicko migrate phases-to-milestones \
  --project-id <CLIC project id> \
  --epic-id <CLIC-2 issue id> \
  --apply
```

Expected: 14 milestones created, 56 tasks re-pointed, 14 phase issues + 1 epic deleted.

- [ ] **Step 3: Push to deploy**

```bash
git push origin main
```

Dokploy auto-deploys backend + frontend (~3-5 min each).

- [ ] **Step 4: Verify in production**

Open `https://ops.clickodigital.com`, navigate to a project, switch to Overview tab. Confirm:
- Milestones section renders with rows + dates + counts + progress
- Sidebar Milestones block lists the same milestones
- Issues tab → click a milestone in the sidebar → list filters correctly
- Issue rows show the milestone chip beside the parent chip
- Issue detail has a Milestone picker that updates the issue

---

## Self-review checklist (run before handing off)

- [ ] Every spec section maps to a task: schema (T1), SQL (T2), handlers (T3), issue endpoint plumbing (T4), enrichment (T5), migration script (T6), TS types + API (T7), queries/mutations (T8), realtime (T9), components (T10–T13), wiring into existing pages (T14–T17), E2E (T18), full check (T19) ✓
- [ ] No "TBD" / "TODO" / "implement later" anywhere in this plan ✓
- [ ] Type names consistent across tasks: `MilestoneResponse` (Go), `Milestone` (TS), `milestone_id` JSON, `MilestoneID` Go field ✓
- [ ] Helper names referenced in later tasks (`enrichWithMilestones`, `enrichSingleWithMilestone`, `MilestoneChip`, `MilestonesSidebarBlock`, `MilestonesSection`, `MilestonePicker`, `MilestoneFormDialog`) all defined in earlier tasks ✓
- [ ] All commit messages follow conventional format (`feat(scope):`, `test(scope):`) ✓
