# Project Milestones — Design

> 2026-04-30

## Problem

The "Phases" inside a project today are emulated through `parent_issue_id`: an Epic-issue at the top, Phase-issues as its children, and the actual work as grandchildren. This works but creates four real costs:

1. **Phases clutter the issue list.** They appear as 14 extra rows alongside the actual work.
2. **Phases carry fields they don't need** — status, priority, assignee, cycle_id, parent_issue_id chain — because they're forced into the issue model.
3. **No native progress / dates** at the phase level. The project's roadmap and overview don't see them as structural.
4. **No filter** to scope the issue list to one phase without remembering parent IDs.

Linear solves this with a first-class `Milestone` entity that owns target dates, has computed progress, and groups issues without being one. We adopt the same model.

## Solution

Add a `Milestone` entity scoped to a project. Issues get a nullable `milestone_id`. Sub-issues (`parent_issue_id`) stay independent — milestones answer "which phase of the project", parent_issue_id answers "which task am I a sub-task of". Cycles also stay independent — cycles answer "which sprint", milestones answer "which phase". An issue can carry all three references at once.

The UI exposes milestones in three surfaces: a sidebar block on the project page, an inline section in the project overview body, and a chip on every issue row/card alongside the parent chip we just shipped.

## Data model

New table `milestone`:

```sql
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
```

No status column. Status is derived: `planned` when zero issues started, `in_progress` when some started but not all done, `completed` when all issues done. Computed in the API response.

`issue` table gets one column:

```sql
ALTER TABLE issue ADD COLUMN milestone_id UUID REFERENCES milestone(id) ON DELETE SET NULL;
CREATE INDEX issue_milestone_idx ON issue(milestone_id) WHERE milestone_id IS NOT NULL;
```

`ON DELETE SET NULL` is the contract for milestone deletion: orphaned issues fall into the "No milestone" bucket rather than disappearing.

## Backend

### SQL queries (`server/pkg/db/queries/milestone.sql`)

- `ListMilestonesByProject(project_id)` — returns rows ordered by `position ASC, target_date ASC NULLS LAST`. Includes derived `total_count`, `done_count`, `derived_status` via a single `LEFT JOIN issue` + `GROUP BY`.
- `GetMilestoneInProject(id, project_id)` — single fetch for ownership check.
- `CreateMilestone`, `UpdateMilestone`, `DeleteMilestone` — straight CRUD.
- `ReorderMilestones(ids[])` — batch position update for drag-reorder.
- `ListMilestoneSummariesByIDs(ids[])` — batch fetch of `id, project_id, name` for the issue-row chip enrichment, mirroring the `GetIssueParentSummaries` pattern.

### Handlers (`server/internal/handler/milestone.go`)

```
GET    /api/projects/{id}/milestones          → ListMilestones
POST   /api/projects/{id}/milestones          → CreateMilestone
GET    /api/milestones/{id}                   → GetMilestone
PUT    /api/milestones/{id}                   → UpdateMilestone
DELETE /api/milestones/{id}                   → DeleteMilestone
POST   /api/projects/{id}/milestones/reorder  → ReorderMilestones
```

Workspace gating: every handler resolves the project's workspace and checks membership before answering. Same pattern as `cycle.go`.

`MilestoneResponse` shape:

```json
{
  "id": "...",
  "project_id": "...",
  "name": "Discovery & Technical Research",
  "description": "...",
  "start_date": "2026-04-30",
  "target_date": "2026-05-05",
  "position": 1.0,
  "total_count": 4,
  "done_count": 3,
  "percent": 75,
  "derived_status": "in_progress",
  "created_at": "...",
  "updated_at": "..."
}
```

### Issue endpoint changes

- `IssueResponse` gains optional `milestone_id`, `milestone_name` (for the chip — mirrors the `parent_identifier`/`parent_title` pattern).
- `UpdateIssueRequest` gains `milestone_id *string` so it can be set/cleared.
- `BatchUpdateIssues` handler dispatches `milestone_id` (mirror the project_id block — same fix we just did for cycle_id).
- A new `enrichWithMilestones` helper batches per-list, like `enrichWithParents`. The list endpoints call both.

### WS events

- `milestone:created`, `milestone:updated`, `milestone:deleted` — payload carries the milestone JSON or just the id for delete.
- `issue:updated` already publishes the issue with `milestone_id` set; the realtime sync layer invalidates `projectKeys.milestones(wsId, projectId)` on every issue mutation so the derived counts refresh.

### Migration script

`server/cmd/multica/cmd_migrate.go` — new `multica migrate phases-to-milestones <project_id>` subcommand:

1. Accept `--project-id <id>` and `--epic-id <id>` flags. Both required (no auto-detection — too risky on a real project).
2. For each direct child of the epic (the phases): insert a milestone row using the phase's title as the milestone name, the phase issue's description as the milestone description, and `position` from the phase's `position`.
3. For each direct child of that phase (the tasks): set `milestone_id` to the new milestone, set `parent_issue_id` to NULL (these were never real sub-tasks).
4. Hard-delete the phase issues (no soft-delete machinery exists for issues; we don't want to invent one).
5. Hard-delete the epic issue itself.
6. `--dry-run` mode by default — prints the plan without writing. Pass `--apply` to commit.
7. Idempotent: re-runnable safely. Before inserting, check whether a milestone with the same `(project_id, name)` already exists; skip the insert and reuse the id for re-pointing tasks.

## Frontend

### Types (`packages/core/types/milestone.ts`, `packages/core/types/issue.ts`)

```ts
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
  percent: number;
  derived_status: "planned" | "in_progress" | "completed";
  created_at: string;
  updated_at: string;
}

// Issue gains:
milestone_id?: string | null;
milestone_name?: string;
```

### Queries (`packages/core/milestones/queries.ts`)

```ts
export const milestoneKeys = {
  all: (wsId: string) => ["milestones", wsId] as const,
  byProject: (wsId: string, projectId: string) =>
    [...milestoneKeys.all(wsId), "project", projectId] as const,
  detail: (wsId: string, id: string) =>
    [...milestoneKeys.all(wsId), id] as const,
};

export function projectMilestonesOptions(wsId: string, projectId: string);
export function milestoneDetailOptions(wsId: string, id: string);
```

### Mutations (`packages/core/milestones/mutations.ts`)

`useCreateMilestone`, `useUpdateMilestone`, `useDeleteMilestone`, `useReorderMilestones`. Optimistic updates against `milestoneKeys.byProject`. On settle, invalidate `milestoneKeys.all(wsId)` and the project's issues caches (so milestone chips refresh).

`useUpdateIssue` and `useBatchUpdateIssues` (we touched these recently for cycle/parent) get one more optimistic patch: for any `cycleKeys.issues(wsId, *)` / `issueKeys.list(wsId)` cache that contains the issue, also patch `milestone_id` and `milestone_name` if the update touched them. On settle, invalidate `milestoneKeys.all(wsId)` so the per-milestone counts refresh.

### Components

#### Project Overview body (`packages/views/projects/components/project-overview-page.tsx`)

Existing structure stays. Two changes:

1. **Description renders as markdown** — switch the description display from plain text to the existing `Markdown` renderer used in issue detail. The editor is the same one used for issues. Larger min-height (~12 lines) so a Goal/Scope writeup has room to breathe.
2. **NEW Milestones section** at the bottom of the body. Each row: diamond icon (filled per derived status), name, target date, "X issues · Y%", one-line description below the name. "+ Milestone" button at the bottom to create. Click a milestone → navigate to the Issues tab pre-filtered to that milestone (no inline expand — keeps the overview a stable document). Click the diamond icon → opens the edit dialog.

#### Project sidebar (`packages/views/projects/components/project-sidebar.tsx`)

New compact `MilestonesSidebarBlock` mirroring Linear's screenshot — diamond + name + `X% of N` + target date, "+" button. Slots between the existing Properties and Progress blocks.

#### Project Issues page (`packages/views/projects/components/project-issues-page.tsx` — exists)

Right sidebar gets the same `MilestonesSidebarBlock`. Clicking a milestone in the sidebar **filters the issue list** to that milestone (sets `milestoneFilter` in the project's view store; the existing filter mechanism handles the rest). A "Clear filter" link appears at the top when active. Status grouping inside the list stays as primary axis. Progress: `4 of 56 issues` style indicator.

#### Milestone create/edit dialog (`packages/views/milestones/components/milestone-form-dialog.tsx`)

shadcn `Dialog` + `Form` primitives. Fields: name (required), description (textarea, markdown), start_date (DatePicker), target_date (DatePicker). Used from both the sidebar "+" and the body section "+ Milestone" button.

#### Issue row + board card chip

Mirror the parent chip we just shipped. New `MilestoneChip` in `packages/views/milestones/components/milestone-chip.tsx` — diamond icon, `bg-muted/60`, `text-muted-foreground`. Tooltip: `<milestone_name> · <X% of N>`. Click navigates to the project's issues page filtered to this milestone (`navigation.push(p.projectIssues(projectId) + "?milestone=" + id)`).

Inserted into `list-row.tsx` and `board-card.tsx` between the parent chip and the project chip.

#### Issue detail picker

`MilestonePicker` component — shadcn `Combobox` listing the project's milestones. Slots into the issue detail right panel under Project, above Cycle. When the issue's project changes, the milestone picker disables (and clears) until a project is selected.

#### Filter bar

Existing filter bar (`issues-header.tsx`) gets a "Milestone" submenu mirroring Cycle. Adds `milestone` to the view store's filter set.

### CSS / design tokens

Every new component uses shadcn primitives (`Dialog`, `Combobox`, `DatePicker`, `Form`, `Tooltip`, `Button`) and the existing semantic tokens (`bg-background`, `bg-muted`, `text-muted-foreground`, `border`, `text-primary`). No hardcoded colors. Diamond icon comes from `lucide-react`'s `Diamond` (filled/outline variants for derived status).

### Cross-platform

All new components live in `packages/views/milestones/`. No `next/*` or `react-router-dom` imports. Web and desktop apps wire the new routes through their own platform layers.

## Cycles isolation

Cycles and milestones are orthogonal:
- An issue can be in `Cycle 1` AND in `Phase 1` (most issues will be).
- Cycle pickers, the cycle sweeper, the cycle detail page, the cycle batch picker — none of them touch milestone code.
- Cycle filter and milestone filter are AND-combined when both are set.

## Permissions

Anyone with project access can create, edit, reorder, or delete milestones. Same as cycles. No new role.

## Empty states / edge cases

- **Project with zero milestones:** the sidebar block shows "+ Add milestone" only; the overview body section shows the same.
- **Milestone with zero issues:** displays `0 issues · 0%`. Status is `planned`. No special UI.
- **Deleting a milestone with issues:** confirm dialog ("Delete X? Y issues will be moved to No milestone"). DB FK handles the actual unset.
- **Issue moved between projects:** if the issue had a `milestone_id` from the old project, set it to NULL on transfer (the milestone belongs to the old project). Mutation handles this server-side.
- **Project deleted:** milestones cascade-delete via FK; issues' `milestone_id` becomes NULL via FK.
- **No milestone bucket** in grouped views: rendered last, with `text-muted-foreground` styling and "No milestone" label.

## Out of scope (v1)

- Workspace `/roadmap` page changes — stays project-bar-only.
- Milestone-level assignees / leads.
- Milestone-level progress *targets* (e.g. "this milestone aims for 80% by date X").
- Bulk milestone operations (move N issues between milestones via the toolbar). The existing batch-update endpoint already supports it via `milestone_id`; UI affordance is post-v1.
- Per-milestone activity feed.
- Auto-migration of existing data on deploy. Migration is opt-in via the CLI command.

## Tests

### Backend (`server/internal/handler/milestone_test.go`)

- Create / list / get / update / delete milestones, all gated by workspace membership.
- `derived_status` correctness across the three states (planned, in_progress, completed).
- Deleting a milestone unsets `milestone_id` on its issues without deleting them.
- `BatchUpdateIssues` accepts and applies `milestone_id`.

### Frontend

- `packages/core/milestones/mutations.test.ts` — optimistic patch + rollback for create/update/delete.
- `packages/core/issues/mutations.test.ts` — `useUpdateIssue` patches `milestone_id` in cycle/list caches.
- `packages/views/milestones/components/milestone-chip.test.tsx` — renders the chip when `milestone_name` is present, hides otherwise, click navigates to filtered issues page.
- `packages/views/projects/components/project-overview-page.test.tsx` — milestones section renders with the right data shape.
- `packages/views/issues/components/list-row.test.tsx` — milestone chip slots between parent and project.

### E2E (`e2e/tests/milestones.spec.ts`)

One end-to-end flow: create a project, create two milestones, assign three issues to the first milestone, filter the issue list by that milestone, verify only the three appear, delete the milestone, verify the issues are still there with no milestone.

### Migration

`server/cmd/multica/cmd_migrate_test.go` — fixture project with epic + 3 phases + 9 tasks. Run the migration in dry-run, assert the planned changes. Run for real, assert milestones created with right names, tasks re-pointed to milestones, phase issues deleted.

## Rollout

1. Backend lands: schema, handlers, WS events, sqlc.
2. Frontend types + queries + mutations land.
3. UI components land in dependency order: chip, sidebar block, picker, dialog, page integrations.
4. Migration command lands.
5. Manual run: `multica migrate phases-to-milestones <CLIC project id> --dry-run`, verify, then run for real.
6. Old phase-issues are gone, milestones populated, all 56 tasks attributed.

Single PR. The migration command is the only operator step after deploy.
