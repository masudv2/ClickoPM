# Issue Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add workspace-level labels with preset colors that can be assigned to issues (many-to-many), with full CRUD, picker UI, display on issue rows, and filtering.

**Architecture:** New `label` + `issue_label` tables, Go CRUD handler following the project handler pattern, TypeScript types/queries/mutations in `packages/core/labels/`, UI components in `packages/views/labels/`, integrated into existing issue detail sidebar and list/board views. Labels management added as a new tab in workspace settings.

**Tech Stack:** PostgreSQL (sqlc), Go (chi router), TypeScript, React, TanStack Query, Zustand, shadcn/ui, Tailwind CSS

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `server/migrations/059_labels.up.sql` | Create label + issue_label tables |
| `server/migrations/059_labels.down.sql` | Drop label + issue_label tables |
| `server/pkg/db/queries/label.sql` | sqlc queries for labels CRUD + issue-label joins |
| `server/internal/handler/label.go` | HTTP handlers for labels CRUD + issue label assignment |
| `packages/core/types/label.ts` | Label TypeScript interfaces |
| `packages/core/labels/config.ts` | Preset color palette config |
| `packages/core/labels/queries.ts` | TanStack Query keys + options |
| `packages/core/labels/mutations.ts` | Mutations with optimistic updates |
| `packages/core/labels/index.ts` | Barrel export |
| `packages/views/labels/components/label-pill.tsx` | Colored badge component |
| `packages/views/labels/components/label-picker.tsx` | Multi-select popover for assigning labels |
| `packages/views/labels/components/labels-settings-tab.tsx` | Settings tab for managing labels |
| `packages/views/labels/components/index.ts` | Barrel export |
| `packages/views/labels/index.ts` | Barrel export |

### Modified Files
| File | Change |
|------|--------|
| `server/pkg/protocol/events.go` | Add label event constants |
| `server/cmd/server/router.go` | Register label routes |
| `server/internal/handler/issue.go` | Add `labels` field to IssueResponse, join labels in ListIssues/GetIssue |
| `server/pkg/db/queries/issue.sql` | Add label_id filter to ListIssues |
| `packages/core/types/issue.ts` | Add `labels` field to Issue interface |
| `packages/core/api/client.ts` | Add label API methods |
| `packages/core/types/index.ts` | Export label types |
| `packages/views/issues/components/issue-detail.tsx` | Add LabelPicker to sidebar |
| `packages/views/issues/components/list-view.tsx` | Show label pills on issue rows |
| `packages/views/issues/components/board-view.tsx` | Show label pills on board cards |
| `packages/views/settings/components/settings-page.tsx` | Add Labels tab |

---

## Task 1: Database Migration

**Files:**
- Create: `server/migrations/059_labels.up.sql`
- Create: `server/migrations/059_labels.down.sql`

- [ ] **Step 1: Write the up migration**

```sql
-- server/migrations/059_labels.up.sql

-- Workspace-level labels
CREATE TABLE label (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT 'gray'
        CHECK (color IN ('red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink', 'gray')),
    position REAL NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_label_workspace_name ON label(workspace_id, lower(name));
CREATE INDEX idx_label_workspace ON label(workspace_id);

-- Many-to-many: issues <-> labels
CREATE TABLE issue_label (
    issue_id UUID NOT NULL REFERENCES issue(id) ON DELETE CASCADE,
    label_id UUID NOT NULL REFERENCES label(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, label_id)
);

CREATE INDEX idx_issue_label_label ON issue_label(label_id);
```

- [ ] **Step 2: Write the down migration**

```sql
-- server/migrations/059_labels.down.sql
DROP TABLE IF EXISTS issue_label;
DROP TABLE IF EXISTS label;
```

- [ ] **Step 3: Run the migration**

Run: `cd /Users/masud/multica && make migrate-up`
Expected: `up  059_labels` in output, exit 0

- [ ] **Step 4: Verify tables exist**

Run: `docker exec multica-postgres-1 psql -U multica -d multica -c "\dt label; \dt issue_label;"`
Expected: Both tables listed

- [ ] **Step 5: Commit**

```bash
git add server/migrations/059_labels.up.sql server/migrations/059_labels.down.sql
git commit -m "feat(db): add label and issue_label tables"
```

---

## Task 2: sqlc Queries

**Files:**
- Create: `server/pkg/db/queries/label.sql`

- [ ] **Step 1: Write label CRUD queries**

```sql
-- server/pkg/db/queries/label.sql

-- name: ListLabels :many
SELECT * FROM label
WHERE workspace_id = $1
ORDER BY position ASC, created_at ASC;

-- name: GetLabel :one
SELECT * FROM label
WHERE id = $1;

-- name: GetLabelInWorkspace :one
SELECT * FROM label
WHERE id = $1 AND workspace_id = $2;

-- name: CreateLabel :one
INSERT INTO label (workspace_id, name, color, position)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: UpdateLabel :one
UPDATE label SET
    name = COALESCE(sqlc.narg('name'), name),
    color = COALESCE(sqlc.narg('color'), color),
    position = COALESCE(sqlc.narg('position'), position),
    updated_at = now()
WHERE id = $1
RETURNING *;

-- name: DeleteLabel :exec
DELETE FROM label WHERE id = $1;

-- name: GetMaxLabelPosition :one
SELECT COALESCE(MAX(position), 0)::real AS max_position
FROM label
WHERE workspace_id = $1;

-- Issue-label association
-- name: SetIssueLabels :exec
DELETE FROM issue_label WHERE issue_id = $1;

-- name: AddIssueLabel :exec
INSERT INTO issue_label (issue_id, label_id)
VALUES ($1, $2)
ON CONFLICT DO NOTHING;

-- name: ListIssueLabels :many
SELECT l.* FROM label l
JOIN issue_label il ON il.label_id = l.id
WHERE il.issue_id = $1
ORDER BY l.position ASC;

-- name: ListIssueLabelsForIssues :many
SELECT il.issue_id, l.id, l.workspace_id, l.name, l.color, l.position, l.created_at, l.updated_at
FROM label l
JOIN issue_label il ON il.label_id = l.id
WHERE il.issue_id = ANY(sqlc.arg('issue_ids')::uuid[])
ORDER BY l.position ASC;
```

- [ ] **Step 2: Regenerate sqlc**

Run: `cd /Users/masud/multica && make sqlc`
Expected: No errors, generated Go files updated in `server/pkg/db/`

- [ ] **Step 3: Verify generated code compiles**

Run: `cd /Users/masud/multica/server && go build ./...`
Expected: Clean build, exit 0

- [ ] **Step 4: Commit**

```bash
git add server/pkg/db/queries/label.sql server/pkg/db/
git commit -m "feat(db): add sqlc queries for labels"
```

---

## Task 3: WebSocket Events

**Files:**
- Modify: `server/pkg/protocol/events.go`

- [ ] **Step 1: Add label event constants**

Add after the Project events block (line 69) in `server/pkg/protocol/events.go`:

```go
	// Label events
	EventLabelCreated = "label:created"
	EventLabelUpdated = "label:updated"
	EventLabelDeleted = "label:deleted"
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/masud/multica/server && go build ./...`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add server/pkg/protocol/events.go
git commit -m "feat(ws): add label WebSocket event types"
```

---

## Task 4: Go Handler

**Files:**
- Create: `server/internal/handler/label.go`

- [ ] **Step 1: Write the label handler**

```go
// server/internal/handler/label.go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/multica-ai/multica/server/pkg/db"
	"github.com/multica-ai/multica/server/pkg/protocol"
)

// ---------- response / request types ----------

type LabelResponse struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspace_id"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	Position    float64 `json:"position"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
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

// ---------- helpers ----------

func labelFromRow(row db.Label) LabelResponse {
	return LabelResponse{
		ID:          uuidToString(row.ID),
		WorkspaceID: uuidToString(row.WorkspaceID),
		Name:        row.Name,
		Color:       row.Color,
		Position:    float64(row.Position),
		CreatedAt:   row.CreatedAt.Time.Format("2006-01-02T15:04:05Z"),
		UpdatedAt:   row.UpdatedAt.Time.Format("2006-01-02T15:04:05Z"),
	}
}

// ---------- handlers ----------

func (h *Handler) ListLabels(w http.ResponseWriter, r *http.Request) {
	wsID, err := h.resolveWorkspaceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	rows, err := h.Queries.ListLabels(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list labels")
		return
	}

	labels := make([]LabelResponse, len(rows))
	for i, row := range rows {
		labels[i] = labelFromRow(row)
	}

	writeJSON(w, http.StatusOK, map[string]any{"labels": labels})
}

func (h *Handler) CreateLabel(w http.ResponseWriter, r *http.Request) {
	wsID, err := h.resolveWorkspaceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	actorType, actorID := actorFromContext(r.Context())

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

	// Get next position
	maxPos, err := h.Queries.GetMaxLabelPosition(r.Context(), wsID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get position")
		return
	}

	row, err := h.Queries.CreateLabel(r.Context(), db.CreateLabelParams{
		WorkspaceID: wsID,
		Name:        req.Name,
		Color:       req.Color,
		Position:    maxPos + 1,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create label")
		return
	}

	resp := labelFromRow(row)
	h.publish(protocol.EventLabelCreated, uuidToString(wsID), actorType, actorID, resp)
	writeJSON(w, http.StatusCreated, resp)
}

func (h *Handler) UpdateLabel(w http.ResponseWriter, r *http.Request) {
	wsID, err := h.resolveWorkspaceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	actorType, actorID := actorFromContext(r.Context())

	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid label id")
		return
	}

	// Verify label belongs to workspace
	if _, err := h.Queries.GetLabelInWorkspace(r.Context(), db.GetLabelInWorkspaceParams{ID: id, WorkspaceID: wsID}); err != nil {
		writeError(w, http.StatusNotFound, "label not found")
		return
	}

	var req UpdateLabelRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	params := db.UpdateLabelParams{ID: id}
	if req.Name != nil {
		params.Name = useString(*req.Name)
	}
	if req.Color != nil {
		params.Color = useString(*req.Color)
	}
	if req.Position != nil {
		pos := float32(*req.Position)
		params.Position = &pos
	}

	row, err := h.Queries.UpdateLabel(r.Context(), params)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update label")
		return
	}

	resp := labelFromRow(row)
	h.publish(protocol.EventLabelUpdated, uuidToString(wsID), actorType, actorID, resp)
	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) DeleteLabel(w http.ResponseWriter, r *http.Request) {
	wsID, err := h.resolveWorkspaceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	actorType, actorID := actorFromContext(r.Context())

	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid label id")
		return
	}

	if _, err := h.Queries.GetLabelInWorkspace(r.Context(), db.GetLabelInWorkspaceParams{ID: id, WorkspaceID: wsID}); err != nil {
		writeError(w, http.StatusNotFound, "label not found")
		return
	}

	if err := h.Queries.DeleteLabel(r.Context(), id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete label")
		return
	}

	h.publish(protocol.EventLabelDeleted, uuidToString(wsID), actorType, actorID, map[string]string{"id": uuidToString(id)})
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) ListIssueLabels(w http.ResponseWriter, r *http.Request) {
	id, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid issue id")
		return
	}

	rows, err := h.Queries.ListIssueLabels(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list issue labels")
		return
	}

	labels := make([]LabelResponse, len(rows))
	for i, row := range rows {
		labels[i] = labelFromRow(row)
	}

	writeJSON(w, http.StatusOK, map[string]any{"labels": labels})
}

func (h *Handler) SetIssueLabels(w http.ResponseWriter, r *http.Request) {
	wsID, err := h.resolveWorkspaceID(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	actorType, actorID := actorFromContext(r.Context())

	issueID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid issue id")
		return
	}

	var req SetIssueLabelsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Clear existing labels
	if err := h.Queries.SetIssueLabels(r.Context(), issueID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to clear labels")
		return
	}

	// Add new labels
	for _, lid := range req.LabelIDs {
		labelID, err := parseUUID(lid)
		if err != nil {
			continue
		}
		_ = h.Queries.AddIssueLabel(r.Context(), db.AddIssueLabelParams{
			IssueID: issueID,
			LabelID: labelID,
		})
	}

	// Fetch updated labels for response
	rows, err := h.Queries.ListIssueLabels(r.Context(), issueID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list issue labels")
		return
	}

	labels := make([]LabelResponse, len(rows))
	for i, row := range rows {
		labels[i] = labelFromRow(row)
	}

	h.publish(protocol.EventIssueUpdated, uuidToString(wsID), actorType, actorID, map[string]any{
		"id":     uuidToString(issueID),
		"labels": labels,
	})
	writeJSON(w, http.StatusOK, map[string]any{"labels": labels})
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/masud/multica/server && go build ./...`
Expected: Clean build. If there are compilation errors due to sqlc generated types (e.g., `useString` helper, `UpdateLabelParams` field names), adjust the handler code to match the actual generated types from Task 2.

- [ ] **Step 3: Commit**

```bash
git add server/internal/handler/label.go
git commit -m "feat(api): add label CRUD and issue-label handlers"
```

---

## Task 5: Route Registration

**Files:**
- Modify: `server/cmd/server/router.go`

- [ ] **Step 1: Add label routes**

Find the projects route block in `server/cmd/server/router.go` (around line 291). Add the labels route block directly after it:

```go
		// Labels
		r.Route("/api/labels", func(r chi.Router) {
			r.Get("/", h.ListLabels)
			r.Post("/", h.CreateLabel)
			r.Route("/{id}", func(r chi.Router) {
				r.Put("/", h.UpdateLabel)
				r.Delete("/", h.DeleteLabel)
			})
		})
```

Also find the issues route block and add the labels sub-route inside the `/{id}` block:

```go
			r.Get("/labels", h.ListIssueLabels)
			r.Put("/labels", h.SetIssueLabels)
```

- [ ] **Step 2: Verify compilation**

Run: `cd /Users/masud/multica/server && go build ./...`
Expected: Clean build

- [ ] **Step 3: Test API manually**

Run: `cd /Users/masud/multica && make server` (restart if already running)

Then test with curl:
```bash
curl -s http://localhost:8080/api/labels -H "X-Workspace-Slug: <your-workspace-slug>" -H "Cookie: <your-auth-cookie>" | head
```
Expected: `{"labels":[]}`

- [ ] **Step 4: Commit**

```bash
git add server/cmd/server/router.go
git commit -m "feat(api): register label routes"
```

---

## Task 6: Add Labels to Issue Response

**Files:**
- Modify: `server/internal/handler/issue.go`

- [ ] **Step 1: Add labels field to IssueResponse**

In `server/internal/handler/issue.go`, add to the `IssueResponse` struct (after `Attachments`):

```go
	Labels         []LabelResponse         `json:"labels"`
```

- [ ] **Step 2: Populate labels in issue list/detail responses**

Find the function that builds issue responses (the helper that converts DB rows to `IssueResponse`). After the issue list is built, add a batch label fetch:

After building the issue responses list, add:
```go
	// Batch-fetch labels for all issues
	if len(issueIDs) > 0 {
		labelRows, err := h.Queries.ListIssueLabelsForIssues(r.Context(), issueIDs)
		if err == nil {
			labelMap := make(map[string][]LabelResponse)
			for _, lr := range labelRows {
				lid := uuidToString(lr.IssueID)
				labelMap[lid] = append(labelMap[lid], LabelResponse{
					ID:          uuidToString(lr.ID),
					WorkspaceID: uuidToString(lr.WorkspaceID),
					Name:        lr.Name,
					Color:       lr.Color,
					Position:    float64(lr.Position),
					CreatedAt:   lr.CreatedAt.Time.Format("2006-01-02T15:04:05Z"),
					UpdatedAt:   lr.UpdatedAt.Time.Format("2006-01-02T15:04:05Z"),
				})
			}
			for i := range issues {
				if labels, ok := labelMap[issues[i].ID]; ok {
					issues[i].Labels = labels
				}
			}
		}
	}
```

For `GetIssue`, fetch labels for the single issue:
```go
	labelRows, _ := h.Queries.ListIssueLabels(r.Context(), issueUUID)
	labels := make([]LabelResponse, len(labelRows))
	for i, lr := range labelRows {
		labels[i] = labelFromRow(lr)
	}
	resp.Labels = labels
```

Note: The exact insertion point depends on how the existing handler constructs responses. Read the full `ListIssues` and `GetIssue` functions to find where to insert. The pattern follows how `Reactions` and `Attachments` are populated.

- [ ] **Step 3: Verify compilation and test**

Run: `cd /Users/masud/multica/server && go build ./...`
Expected: Clean build

- [ ] **Step 4: Commit**

```bash
git add server/internal/handler/issue.go
git commit -m "feat(api): include labels in issue responses"
```

---

## Task 7: TypeScript Types

**Files:**
- Create: `packages/core/types/label.ts`
- Modify: `packages/core/types/issue.ts`
- Modify: `packages/core/types/index.ts`

- [ ] **Step 1: Create label types**

```typescript
// packages/core/types/label.ts

export type LabelColor =
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "teal"
  | "blue"
  | "indigo"
  | "purple"
  | "pink"
  | "gray";

export interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: LabelColor;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateLabelRequest {
  name: string;
  color: LabelColor;
}

export interface UpdateLabelRequest {
  name?: string;
  color?: LabelColor;
  position?: number;
}

export interface ListLabelsResponse {
  labels: Label[];
}
```

- [ ] **Step 2: Add labels to Issue type**

In `packages/core/types/issue.ts`, add to the `Issue` interface (after `reactions`):

```typescript
  labels?: Label[];
```

Add the import at the top:
```typescript
import type { Label } from "./label";
```

- [ ] **Step 3: Export label types**

In `packages/core/types/index.ts`, add:
```typescript
export * from "./label";
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 5: Commit**

```bash
git add packages/core/types/label.ts packages/core/types/issue.ts packages/core/types/index.ts
git commit -m "feat(types): add Label types and extend Issue with labels"
```

---

## Task 8: Label Config (Color Palette)

**Files:**
- Create: `packages/core/labels/config.ts`
- Create: `packages/core/labels/index.ts`

- [ ] **Step 1: Create color config**

```typescript
// packages/core/labels/config.ts

import type { LabelColor } from "../types";

export const LABEL_COLOR_CONFIG: Record<
  LabelColor,
  { label: string; dot: string; bg: string; text: string }
> = {
  red:    { label: "Red",    dot: "bg-red-500",    bg: "bg-red-500/15",    text: "text-red-700 dark:text-red-400" },
  orange: { label: "Orange", dot: "bg-orange-500", bg: "bg-orange-500/15", text: "text-orange-700 dark:text-orange-400" },
  amber:  { label: "Amber",  dot: "bg-amber-500",  bg: "bg-amber-500/15",  text: "text-amber-700 dark:text-amber-400" },
  yellow: { label: "Yellow", dot: "bg-yellow-500", bg: "bg-yellow-500/15", text: "text-yellow-700 dark:text-yellow-400" },
  lime:   { label: "Lime",   dot: "bg-lime-500",   bg: "bg-lime-500/15",   text: "text-lime-700 dark:text-lime-400" },
  green:  { label: "Green",  dot: "bg-green-500",  bg: "bg-green-500/15",  text: "text-green-700 dark:text-green-400" },
  teal:   { label: "Teal",   dot: "bg-teal-500",   bg: "bg-teal-500/15",   text: "text-teal-700 dark:text-teal-400" },
  blue:   { label: "Blue",   dot: "bg-blue-500",   bg: "bg-blue-500/15",   text: "text-blue-700 dark:text-blue-400" },
  indigo: { label: "Indigo", dot: "bg-indigo-500", bg: "bg-indigo-500/15", text: "text-indigo-700 dark:text-indigo-400" },
  purple: { label: "Purple", dot: "bg-purple-500", bg: "bg-purple-500/15", text: "text-purple-700 dark:text-purple-400" },
  pink:   { label: "Pink",   dot: "bg-pink-500",   bg: "bg-pink-500/15",   text: "text-pink-700 dark:text-pink-400" },
  gray:   { label: "Gray",   dot: "bg-gray-500",   bg: "bg-gray-500/15",   text: "text-gray-700 dark:text-gray-400" },
};

export const LABEL_COLORS: LabelColor[] = [
  "red", "orange", "amber", "yellow", "lime", "green",
  "teal", "blue", "indigo", "purple", "pink", "gray",
];
```

- [ ] **Step 2: Create barrel export**

```typescript
// packages/core/labels/index.ts
export { LABEL_COLOR_CONFIG, LABEL_COLORS } from "./config";
export { labelKeys, labelListOptions } from "./queries";
export { useCreateLabel, useUpdateLabel, useDeleteLabel, useSetIssueLabels } from "./mutations";
```

Note: queries.ts and mutations.ts will be created in the next tasks. This file will need to be updated after those are created. For now, only export config:

```typescript
// packages/core/labels/index.ts
export { LABEL_COLOR_CONFIG, LABEL_COLORS } from "./config";
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/labels/config.ts packages/core/labels/index.ts
git commit -m "feat(core): add label color palette config"
```

---

## Task 9: API Client Methods

**Files:**
- Modify: `packages/core/api/client.ts`

- [ ] **Step 1: Add label methods to API client**

In `packages/core/api/client.ts`, after the Projects section (line 979), add:

```typescript
  // Labels
  async listLabels(): Promise<ListLabelsResponse> {
    return this.fetch("/api/labels");
  }

  async createLabel(data: CreateLabelRequest): Promise<Label> {
    return this.fetch("/api/labels", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateLabel(id: string, data: UpdateLabelRequest): Promise<Label> {
    return this.fetch(`/api/labels/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteLabel(id: string): Promise<void> {
    await this.fetch(`/api/labels/${id}`, { method: "DELETE" });
  }

  async listIssueLabels(issueId: string): Promise<ListLabelsResponse> {
    return this.fetch(`/api/issues/${issueId}/labels`);
  }

  async setIssueLabels(issueId: string, labelIds: string[]): Promise<ListLabelsResponse> {
    return this.fetch(`/api/issues/${issueId}/labels`, {
      method: "PUT",
      body: JSON.stringify({ label_ids: labelIds }),
    });
  }
```

Also add the imports at the top of the file (where other types are imported):
```typescript
import type { Label, CreateLabelRequest, UpdateLabelRequest, ListLabelsResponse } from "../types";
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: No new errors

- [ ] **Step 3: Commit**

```bash
git add packages/core/api/client.ts
git commit -m "feat(api): add label API client methods"
```

---

## Task 10: TanStack Query Options

**Files:**
- Create: `packages/core/labels/queries.ts`

- [ ] **Step 1: Create query keys and options**

```typescript
// packages/core/labels/queries.ts

import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const labelKeys = {
  all: (wsId: string) => ["labels", wsId] as const,
  list: (wsId: string) => [...labelKeys.all(wsId), "list"] as const,
};

export function labelListOptions(wsId: string) {
  return queryOptions({
    queryKey: labelKeys.list(wsId),
    queryFn: () => api.listLabels(),
    select: (data) => data.labels,
  });
}
```

- [ ] **Step 2: Update barrel export**

Update `packages/core/labels/index.ts`:

```typescript
export { LABEL_COLOR_CONFIG, LABEL_COLORS } from "./config";
export { labelKeys, labelListOptions } from "./queries";
```

- [ ] **Step 3: Commit**

```bash
git add packages/core/labels/queries.ts packages/core/labels/index.ts
git commit -m "feat(core): add label TanStack Query options"
```

---

## Task 11: Mutations

**Files:**
- Create: `packages/core/labels/mutations.ts`

- [ ] **Step 1: Create mutations with optimistic updates**

```typescript
// packages/core/labels/mutations.ts

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { labelKeys } from "./queries";
import { issueKeys } from "../issues/queries";
import { useWorkspaceId } from "../hooks";
import type { Label, CreateLabelRequest, UpdateLabelRequest, ListLabelsResponse } from "../types";

export function useCreateLabel() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (data: CreateLabelRequest) => api.createLabel(data),
    onSuccess: (newLabel) => {
      qc.setQueryData<ListLabelsResponse>(labelKeys.list(wsId), (old) =>
        old ? { labels: [...old.labels, newLabel] } : { labels: [newLabel] },
      );
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: labelKeys.list(wsId) });
    },
  });
}

export function useUpdateLabel() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & UpdateLabelRequest) =>
      api.updateLabel(id, data),
    onMutate: ({ id, ...data }) => {
      qc.cancelQueries({ queryKey: labelKeys.list(wsId) });
      const prev = qc.getQueryData<ListLabelsResponse>(labelKeys.list(wsId));
      qc.setQueryData<ListLabelsResponse>(labelKeys.list(wsId), (old) =>
        old ? { labels: old.labels.map((l) => (l.id === id ? { ...l, ...data } : l)) } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(labelKeys.list(wsId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: labelKeys.list(wsId) });
    },
  });
}

export function useDeleteLabel() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.deleteLabel(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: labelKeys.list(wsId) });
      const prev = qc.getQueryData<ListLabelsResponse>(labelKeys.list(wsId));
      qc.setQueryData<ListLabelsResponse>(labelKeys.list(wsId), (old) =>
        old ? { labels: old.labels.filter((l) => l.id !== id) } : old,
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(labelKeys.list(wsId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: labelKeys.list(wsId) });
    },
  });
}

export function useSetIssueLabels() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: ({ issueId, labelIds }: { issueId: string; labelIds: string[] }) =>
      api.setIssueLabels(issueId, labelIds),
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: issueKeys.detail(wsId, vars.issueId) });
      qc.invalidateQueries({ queryKey: issueKeys.list(wsId) });
    },
  });
}
```

- [ ] **Step 2: Update barrel export**

Update `packages/core/labels/index.ts`:

```typescript
export { LABEL_COLOR_CONFIG, LABEL_COLORS } from "./config";
export { labelKeys, labelListOptions } from "./queries";
export { useCreateLabel, useUpdateLabel, useDeleteLabel, useSetIssueLabels } from "./mutations";
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: No new errors. If `issueKeys` import path is wrong, check `packages/core/issues/queries.ts` for the correct export.

- [ ] **Step 4: Commit**

```bash
git add packages/core/labels/mutations.ts packages/core/labels/index.ts
git commit -m "feat(core): add label mutations with optimistic updates"
```

---

## Task 12: Label Pill Component

**Files:**
- Create: `packages/views/labels/components/label-pill.tsx`
- Create: `packages/views/labels/components/index.ts`
- Create: `packages/views/labels/index.ts`

- [ ] **Step 1: Create label pill**

```typescript
// packages/views/labels/components/label-pill.tsx

import { LABEL_COLOR_CONFIG } from "@multica/core/labels";
import type { Label } from "@multica/core/types";
import { cn } from "@multica/ui/lib/utils";

interface LabelPillProps {
  label: Label;
  className?: string;
}

export function LabelPill({ label, className }: LabelPillProps) {
  const colors = LABEL_COLOR_CONFIG[label.color] ?? LABEL_COLOR_CONFIG.gray;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        colors.bg,
        colors.text,
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full shrink-0", colors.dot)} />
      {label.name}
    </span>
  );
}
```

- [ ] **Step 2: Create barrel exports**

```typescript
// packages/views/labels/components/index.ts
export { LabelPill } from "./label-pill";
```

```typescript
// packages/views/labels/index.ts
export * from "./components";
```

- [ ] **Step 3: Commit**

```bash
git add packages/views/labels/
git commit -m "feat(ui): add LabelPill component"
```

---

## Task 13: Label Picker Component

**Files:**
- Create: `packages/views/labels/components/label-picker.tsx`

- [ ] **Step 1: Create label picker**

```typescript
// packages/views/labels/components/label-picker.tsx

"use client";

import { useState } from "react";
import { Tag, Plus, Check } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverTrigger, PopoverContent } from "@multica/ui/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@multica/ui/components/ui/command";
import { Button } from "@multica/ui/components/ui/button";
import { labelListOptions, LABEL_COLOR_CONFIG, LABEL_COLORS, useCreateLabel, useSetIssueLabels } from "@multica/core/labels";
import { useWorkspaceId } from "@multica/core/hooks";
import type { Label, LabelColor } from "@multica/core/types";
import { cn } from "@multica/ui/lib/utils";
import { LabelPill } from "./label-pill";

interface LabelPickerProps {
  issueId: string;
  labels: Label[];
  align?: "start" | "center" | "end";
}

export function LabelPicker({ issueId, labels, align = "start" }: LabelPickerProps) {
  const wsId = useWorkspaceId();
  const [open, setOpen] = useState(false);
  const { data: allLabels = [] } = useQuery(labelListOptions(wsId));
  const setIssueLabels = useSetIssueLabels();
  const createLabel = useCreateLabel();

  const [search, setSearch] = useState("");
  const selectedIds = new Set(labels.map((l) => l.id));

  function toggleLabel(labelId: string) {
    const next = selectedIds.has(labelId)
      ? [...selectedIds].filter((id) => id !== labelId)
      : [...selectedIds, labelId];
    setIssueLabels.mutate({ issueId, labelIds: next });
  }

  async function handleCreate() {
    if (!search.trim()) return;
    const newLabel = await createLabel.mutateAsync({ name: search.trim(), color: "gray" as LabelColor });
    setIssueLabels.mutate({ issueId, labelIds: [...selectedIds, newLabel.id] });
    setSearch("");
  }

  const noLabels = labels.length === 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 min-w-0 text-xs rounded-md px-2 py-1 -mx-2 hover:bg-accent/50 transition-colors">
          {noLabels ? (
            <span className="text-muted-foreground">No labels</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {labels.map((l) => (
                <LabelPill key={l.id} label={l} />
              ))}
            </div>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-0" align={align}>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search or create label..."
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {search.trim() ? (
                <button
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-accent rounded-sm"
                  onClick={handleCreate}
                >
                  <Plus className="size-3.5" />
                  Create &quot;{search.trim()}&quot;
                </button>
              ) : (
                <span className="text-xs text-muted-foreground">No labels yet</span>
              )}
            </CommandEmpty>
            <CommandGroup>
              {allLabels
                .filter((l) => l.name.toLowerCase().includes(search.toLowerCase()))
                .map((label) => {
                  const selected = selectedIds.has(label.id);
                  const colors = LABEL_COLOR_CONFIG[label.color] ?? LABEL_COLOR_CONFIG.gray;
                  return (
                    <CommandItem
                      key={label.id}
                      value={label.id}
                      onSelect={() => toggleLabel(label.id)}
                      className="flex items-center gap-2"
                    >
                      <span className={cn("size-2 rounded-full shrink-0", colors.dot)} />
                      <span className="flex-1 truncate">{label.name}</span>
                      {selected && <Check className="size-3.5 text-foreground" />}
                    </CommandItem>
                  );
                })}
            </CommandGroup>
            {search.trim() &&
              !allLabels.some((l) => l.name.toLowerCase() === search.toLowerCase()) && (
                <CommandGroup>
                  <CommandItem onSelect={handleCreate} className="flex items-center gap-2">
                    <Plus className="size-3.5" />
                    Create &quot;{search.trim()}&quot;
                  </CommandItem>
                </CommandGroup>
              )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 2: Update barrel export**

In `packages/views/labels/components/index.ts`, add:
```typescript
export { LabelPicker } from "./label-picker";
```

- [ ] **Step 3: Commit**

```bash
git add packages/views/labels/components/label-picker.tsx packages/views/labels/components/index.ts
git commit -m "feat(ui): add LabelPicker multi-select component"
```

---

## Task 14: Integrate Labels into Issue Detail Sidebar

**Files:**
- Modify: `packages/views/issues/components/issue-detail.tsx`

- [ ] **Step 1: Add LabelPicker to sidebar properties**

In `packages/views/issues/components/issue-detail.tsx`:

Add import at the top:
```typescript
import { LabelPicker } from "../../labels";
```

Find the sidebar properties section (around line 408, after the ProjectPicker PropRow). Add after it:

```typescript
          <PropRow label="Labels">
            <LabelPicker issueId={issue.id} labels={issue.labels ?? []} align="start" />
          </PropRow>
```

- [ ] **Step 2: Verify typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add packages/views/issues/components/issue-detail.tsx
git commit -m "feat(ui): add label picker to issue detail sidebar"
```

---

## Task 15: Show Labels on Issue List/Board Views

**Files:**
- Modify: `packages/views/issues/components/list-view.tsx`
- Modify: `packages/views/issues/components/board-view.tsx`

- [ ] **Step 1: Add label pills to list view**

In `packages/views/issues/components/list-view.tsx`:

Add import:
```typescript
import { LabelPill } from "../../labels";
```

Find where the issue title is rendered in each row. Add label pills after the title:

```typescript
{issue.labels?.map((label) => (
  <LabelPill key={label.id} label={label} />
))}
```

The exact insertion point depends on the list row structure. Look for where `issue.title` is rendered and add the pills in the same flex container, after the title text.

- [ ] **Step 2: Add label pills to board view**

In `packages/views/issues/components/board-view.tsx`:

Add import:
```typescript
import { LabelPill } from "../../labels";
```

Find the board card component. Add labels after the title:

```typescript
{issue.labels && issue.labels.length > 0 && (
  <div className="flex flex-wrap gap-1 mt-1">
    {issue.labels.map((label) => (
      <LabelPill key={label.id} label={label} />
    ))}
  </div>
)}
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/views/issues/components/list-view.tsx packages/views/issues/components/board-view.tsx
git commit -m "feat(ui): show label pills on issue list and board views"
```

---

## Task 16: Labels Settings Tab

**Files:**
- Create: `packages/views/labels/components/labels-settings-tab.tsx`
- Modify: `packages/views/settings/components/settings-page.tsx`

- [ ] **Step 1: Create labels management tab**

```typescript
// packages/views/labels/components/labels-settings-tab.tsx

"use client";

import { useState } from "react";
import { Pencil, Trash2, Plus, GripVertical } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@multica/ui/components/ui/dialog";
import { labelListOptions, LABEL_COLOR_CONFIG, LABEL_COLORS, useCreateLabel, useUpdateLabel, useDeleteLabel } from "@multica/core/labels";
import { useWorkspaceId } from "@multica/core/hooks";
import type { Label, LabelColor } from "@multica/core/types";
import { cn } from "@multica/ui/lib/utils";

function ColorDot({ color, selected, onClick }: { color: LabelColor; selected: boolean; onClick: () => void }) {
  const cfg = LABEL_COLOR_CONFIG[color];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "size-6 rounded-full transition-all",
        cfg.dot,
        selected ? "ring-2 ring-offset-2 ring-foreground ring-offset-background" : "hover:scale-110",
      )}
    />
  );
}

export function LabelsSettingsTab() {
  const wsId = useWorkspaceId();
  const { data: labels = [] } = useQuery(labelListOptions(wsId));
  const createLabel = useCreateLabel();
  const updateLabel = useUpdateLabel();
  const deleteLabel = useDeleteLabel();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>("blue");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  function openCreate() {
    setEditingLabel(null);
    setName("");
    setColor("blue");
    setDialogOpen(true);
  }

  function openEdit(label: Label) {
    setEditingLabel(label);
    setName(label.name);
    setColor(label.color);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) return;
    if (editingLabel) {
      await updateLabel.mutateAsync({ id: editingLabel.id, name: name.trim(), color });
    } else {
      await createLabel.mutateAsync({ name: name.trim(), color });
    }
    setDialogOpen(false);
  }

  async function handleDelete(id: string) {
    await deleteLabel.mutateAsync(id);
    setDeleteConfirm(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold">Labels</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage workspace labels to categorize issues.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4 mr-1" />
          New label
        </Button>
      </div>

      {labels.length === 0 ? (
        <div className="text-center py-12 text-sm text-muted-foreground">
          No labels yet. Create your first label to get started.
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {labels.map((label) => {
            const cfg = LABEL_COLOR_CONFIG[label.color] ?? LABEL_COLOR_CONFIG.gray;
            return (
              <div key={label.id} className="flex items-center gap-3 px-4 py-2.5 group">
                <GripVertical className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 cursor-grab" />
                <span className={cn("size-3 rounded-full shrink-0", cfg.dot)} />
                <span className="text-sm flex-1">{label.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(label)}>
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => setDeleteConfirm(label.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingLabel ? "Edit label" : "New label"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Label name"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Color</label>
              <div className="flex flex-wrap gap-2">
                {LABEL_COLORS.map((c) => (
                  <ColorDot key={c} color={c} selected={color === c} onClick={() => setColor(c)} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              {editingLabel ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteConfirm !== null} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete label</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This label will be removed from all issues. This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Update labels barrel export**

In `packages/views/labels/components/index.ts`:
```typescript
export { LabelPill } from "./label-pill";
export { LabelPicker } from "./label-picker";
export { LabelsSettingsTab } from "./labels-settings-tab";
```

- [ ] **Step 3: Add Labels tab to settings page**

In `packages/views/settings/components/settings-page.tsx`:

Add import:
```typescript
import { Tag } from "lucide-react";
import { LabelsSettingsTab } from "../../labels";
```

Add to the `workspaceTabs` array (after "Members"):
```typescript
  { value: "labels", label: "Labels", icon: Tag },
```

Add the TabsContent (after the members TabsContent):
```typescript
          <TabsContent value="labels"><LabelsSettingsTab /></TabsContent>
```

- [ ] **Step 4: Verify typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/views/labels/components/labels-settings-tab.tsx packages/views/labels/components/index.ts packages/views/settings/components/settings-page.tsx
git commit -m "feat(ui): add labels management settings tab"
```

---

## Task 17: WebSocket Event Handling (Frontend)

**Files:**
- Check and modify: the WebSocket event handler that invalidates queries

- [ ] **Step 1: Find the WS event handler**

Search for where `project:created` or `EventProjectCreated` is handled on the frontend to find the pattern. Look in `packages/core/` for the WebSocket subscription logic.

Run: `grep -r "project:created\|project:updated" packages/core/ --include="*.ts" -l`

- [ ] **Step 2: Add label event invalidation**

In the same file, add handlers for `label:created`, `label:updated`, `label:deleted` that invalidate `labelKeys.list(wsId)`:

```typescript
case "label:created":
case "label:updated":
case "label:deleted":
  qc.invalidateQueries({ queryKey: labelKeys.list(wsId) });
  break;
```

Also invalidate issue queries on `label:deleted` since label removal affects issue label arrays:
```typescript
case "label:deleted":
  qc.invalidateQueries({ queryKey: labelKeys.list(wsId) });
  qc.invalidateQueries({ queryKey: issueKeys.list(wsId) });
  break;
```

- [ ] **Step 3: Verify typecheck**

Run: `pnpm typecheck`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add <modified-ws-handler-file>
git commit -m "feat(ws): handle label WebSocket events"
```

---

## Task 18: End-to-End Verification

- [ ] **Step 1: Restart backend**

Run: `cd /Users/masud/multica && make server` (restart)

- [ ] **Step 2: Restart frontend**

Run: `pnpm dev:web` (restart)

- [ ] **Step 3: Manual test checklist**

Open http://localhost:3000 and verify:
1. Go to Settings > Labels tab -- create a label with name "Bug" and red color
2. Create another label "Feature" with blue color
3. Edit "Feature" label name to "Enhancement"
4. Open any issue -- verify Labels row appears in sidebar
5. Click Labels -- picker opens with "Bug" and "Enhancement"
6. Select "Bug" -- pill appears on issue
7. Go to issue list view -- verify "Bug" pill shows on the issue row
8. Go to board view -- verify "Bug" pill shows on the card
9. Delete "Enhancement" label from Settings -- verify it's gone

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck`
Expected: Pass

- [ ] **Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address label integration issues"
```
