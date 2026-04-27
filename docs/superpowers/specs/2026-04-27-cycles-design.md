# Cycles — Design Spec

## Goal

Implement team-scoped cycles (sprints) as time-boxed periods for issue work, mirroring Linear's cycle model exactly. Cycles include auto-creation, burndown charts, scope/progress tracking with estimation points, and full issue integration. The data model is designed to support future velocity, workload, burnout, roadmaps, and dashboard widget features.

## Architecture

Cycles are team-scoped entities. Each team configures cycle settings (duration, cooldown, auto-create count) in `team.settings.cycles` JSONB — this UI already exists. When cycles are enabled, a backend sweeper auto-creates future cycles, advances statuses, snapshots daily history, and auto-assigns issues based on team settings.

Issues gain a `cycle_id` FK and an `estimate` field. The estimate field uses the team's configured scale (fibonacci, linear, t-shirt) and is required for point-based progress tracking in cycles and future velocity/workload features.

## Data Model

### `cycle` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| workspace_id | UUID FK | References workspace(id) ON DELETE CASCADE |
| team_id | UUID FK | References team(id) ON DELETE CASCADE |
| name | TEXT NOT NULL | Auto-generated ("Cycle 1", "Cycle 2"...), editable |
| description | TEXT | Optional, set via "Edit cycle" |
| number | INTEGER NOT NULL | Per-team sequence (1, 2, 3...) |
| status | TEXT NOT NULL DEFAULT 'planned' | One of: `planned`, `active`, `cooldown`, `completed` |
| starts_at | TIMESTAMPTZ NOT NULL | Cycle start time |
| ends_at | TIMESTAMPTZ NOT NULL | Cycle end time |
| cooldown_ends_at | TIMESTAMPTZ | Null if no cooldown configured |
| completed_at | TIMESTAMPTZ | When the cycle was actually completed |
| scope_history | JSONB NOT NULL DEFAULT '[]' | Array of `{date, count, points}` per day |
| completed_scope_history | JSONB NOT NULL DEFAULT '[]' | Array of `{date, count, points}` per day |
| started_scope_history | JSONB NOT NULL DEFAULT '[]' | Array of `{date, count, points}` per day |
| position | REAL NOT NULL DEFAULT 0 | Ordering |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Indexes:**
- UNIQUE on `(team_id, number)`
- INDEX on `(team_id, status)`
- INDEX on `workspace_id`

### Changes to `issue` table

- Add `cycle_id UUID REFERENCES cycle(id) ON DELETE SET NULL` (nullable)
- Add `estimate INTEGER` (nullable — estimation points)
- INDEX on `cycle_id`
- INDEX on `(team_id, cycle_id)`

### Changes to `project` table

No changes. Projects and cycles are independent dimensions. An issue can belong to both a project and a cycle.

### Migration strategy

1. Create `cycle` table
2. Add `cycle_id` and `estimate` columns to `issue` (both nullable, no backfill needed)
3. Add indexes

### History tracking

The `*_history` JSONB arrays are snapshotted daily by the sweeper for active cycles:

```json
[
  {"date": "2026-04-26", "count": 4, "points": 13},
  {"date": "2026-04-27", "count": 5, "points": 18}
]
```

Both `count` (issue count) and `points` (estimation sum) are stored so charts can toggle between views without recomputing. This data also feeds future velocity and dashboard widget calculations.

### Estimate scales (stored on team.settings.estimates)

| Scale | Values | Storage |
|-------|--------|---------|
| fibonacci | 0, 1, 2, 3, 5, 8, 13, 21 | Integer as-is |
| linear | 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 | Integer as-is |
| tshirt | XS, S, M, L, XL, XXL | Mapped to 1, 2, 3, 5, 8, 13 |

T-shirt sizes map to fibonacci equivalents internally so point math works uniformly.

## API Endpoints

### Cycle CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/teams/{teamId}/cycles | List cycles (filter by `status`, pagination) |
| GET | /api/teams/{teamId}/cycles/active | Get current active cycle |
| POST | /api/teams/{teamId}/cycles | Create cycle manually |
| GET | /api/cycles/{id} | Get cycle with computed progress stats |
| PUT | /api/cycles/{id} | Update cycle (name, description, start/end dates) |
| DELETE | /api/cycles/{id} | Delete cycle (unlinks issues via ON DELETE SET NULL) |

### Cycle Actions

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/cycles/{id}/start | Start a future cycle early (sets status=active) |
| POST | /api/cycles/{id}/complete | Complete cycle early, rolls unfinished issues to next |

### Changes to existing endpoints

- `POST /api/issues` — add optional `cycle_id` and `estimate` fields
- `PUT /api/issues/{id}` — add optional `cycle_id` and `estimate` fields
- `GET /api/issues` — add optional `cycle_id` query param for filtering

### Computed Progress

Returned by `GET /api/cycles/{id}`, calculated server-side from the cycle's issues:

```json
{
  "scope": { "count": 12, "points": 34 },
  "started": { "count": 3, "points": 8, "percent": 25 },
  "completed": { "count": 7, "points": 21, "percent": 58 },
  "success": 72,
  "assignee_breakdown": [
    { "actor_type": "member", "actor_id": "uuid", "name": "...", "total_count": 5, "total_points": 13, "completed_count": 3, "completed_points": 8, "percent": 60 }
  ],
  "label_breakdown": [
    { "label_id": "uuid", "name": "...", "color": "...", "total_count": 3, "total_points": 8, "completed_count": 2, "completed_points": 5, "percent": 67 }
  ],
  "priority_breakdown": [
    { "priority": "high", "total_count": 4, "total_points": 10, "completed_count": 2, "completed_points": 5, "percent": 50 }
  ],
  "project_breakdown": [
    { "project_id": "uuid", "title": "...", "icon": "...", "total_count": 6, "total_points": 15, "completed_count": 4, "completed_points": 10, "percent": 67 }
  ]
}
```

`success` calculation: completed issues count as 100%, started issues count as 25%.

## Cycle Sweeper

Backend cron job running every 10 minutes (same pattern as existing runtime sweeper in `server/cmd/server/`):

### 1. Advance cycle status

For each team with `settings.cycles.enabled = true`:
- If active cycle's `ends_at` has passed and no cooldown configured: set `completed`, move unfinished issues to next planned cycle, activate that cycle
- If active cycle's `ends_at` has passed and cooldown configured: set `cooldown`, set `cooldown_ends_at`
- If cooldown cycle's `cooldown_ends_at` has passed: set `completed`, move unfinished issues, activate next

### 2. Auto-create future cycles

Ensure `auto_create_count` future cycles (status=planned) exist per team:
- Calculate next start date from last cycle's end date (or cooldown end if configured)
- Duration from `settings.cycles.duration_weeks`
- Start day from `settings.cycles.start_day`, aligned to team timezone
- Name pattern: detect from existing names (e.g. "Sprint 3" → "Sprint 4"), fallback to "Cycle N"
- Increment team's cycle counter for the `number` field

### 3. Snapshot daily history

Once per calendar day (in team timezone) for each active cycle:
- Query current issue counts and point sums grouped by status
- Append `{date, count, points}` to `scope_history`, `completed_scope_history`, `started_scope_history`

### 4. Auto-add issues

If team has `auto_add_started` or `auto_add_completed` enabled:
- Find issues in the team with no `cycle_id` and matching status (in_progress for started, done/cancelled for completed)
- Assign to current active cycle, or next planned cycle if current is in cooldown

## WebSocket Events

New event types:
- `cycle:created`, `cycle:updated`, `cycle:deleted`
- `cycle:started`, `cycle:completed`

These invalidate the cycles query cache on the frontend via the existing realtime sync system.

## Frontend UI

All components use the existing app's design system — shadcn components, design tokens, dark theme, same spacing/typography as the teams and issues pages.

### Sidebar Navigation

Expand the existing Cycles link under each team to show sub-items when cycles are enabled:

```
Cycles
  Current        → /{slug}/team/{identifier}/cycles/current
  Upcoming       → /{slug}/team/{identifier}/cycles/upcoming
```

"Current" only shown when an active cycle exists. "Upcoming" only shown when a planned/upcoming cycle exists. Both are plain text links (no icons), indented under Cycles with a left border line (matching Linear's sidebar style in the screenshots).

### Cycles List Page

Route: `/{slug}/team/{identifier}/cycles`

Vertical timeline layout:

- **Left axis**: vertical line with date labels (dates of cycle boundaries) running from bottom (oldest/current) to top (newest/future)
- **Each cycle row**: cycle play icon + name | right-aligned: status badge (`Current`/`Upcoming`/`Planned`/`Completed`) + capacity ring `X% of capacity` + scope indicator `N scope`
- **Current cycle row**: expanded below with an inline burndown chart:
  - Gray horizontal line = total scope
  - Blue dotted line = target line (even distribution of scope over remaining days)
  - Blue solid filled area = completed work
  - X-axis = date labels at cycle start, midpoints, end
  - Right legend: Scope (gray) count, Started (orange) count, Completed (blue) count
  - Estimate triangle icons next to counts (matching Linear's UI)
- **`...` menu** per cycle: Edit cycle (name, description), Delete cycle
- Clicking cycle name navigates to cycle detail

### Cycle Detail Page

Route: `/{slug}/team/{identifier}/cycles/{id}`

**Header bar:**
- Breadcrumb: `Team Name > [cycle icon] Cycle Name v` (dropdown to switch between cycles) + star (favorite) + `...` menu
- `...` menu: Edit cycle, Start early (if planned), Complete early (if active), Delete cycle

**Main area (left panel):**
- "N issues" count
- Issues list grouped by status, using existing `IssueListRow` component
- Each status group header: status icon + label + estimate triangle + total points + `+` button to create issue in this cycle
- Each issue row: `...` menu, identifier, status icon, title, project badge, label pills, estimate badge (triangle + number), assignee avatar, date

**Right sidebar panel (fixed width ~350px):**
- Status badge (Current/Upcoming/Planned) + date range "Apr 26 → May 2"
- Cycle icon + name (large) + star + `...` menu
- "+ Add document or link..." text button (placeholder for now)
- **Progress section** with "Progress v" dropdown to toggle count/points:
  - Scope: gray square + count/points
  - Started: orange square + count/points + percent
  - Completed: blue/purple square + count/points + percent
- **Burndown chart** (same as list page, larger):
  - Uses recharts (already in dependencies)
  - Gray line = scope, blue dotted = target, blue area = completed
  - X-axis dates, Y-axis auto-scaled
- **Breakdown tabs**: `Assignees | Labels | Priority | Projects`
  - Pill-style tab buttons, active tab has filled background
  - Each row: icon/avatar + name + progress ring (circular) + "X% of [triangle] N"
  - Progress ring: small circular indicator showing completion percentage

### Issue Integration

**Issue detail sidebar** — Add "Cycle" field:
- Dropdown picker showing team's cycles (active cycle first, then upcoming/planned)
- Shows cycle icon + name + status badge
- "No cycle" option to unassign

**Issue creation modal** — Add optional cycle picker:
- Same dropdown as detail sidebar
- Auto-selects current active cycle if creating from within a cycle page

**Estimate field on issue detail sidebar:**
- Dropdown based on team's estimate scale setting
- Shows triangle icon + value
- "No estimate" option

**Board card / List row:**
- Show estimate badge (triangle icon + number) when estimate is set
- Show cycle indicator when issue belongs to a cycle (small cycle icon)

**Issue filters:**
- Add "Cycle" filter to issues page: specific cycle, "Current cycle", "No cycle"

### Routing

| Route | Page |
|-------|------|
| `/{slug}/team/{identifier}/cycles` | Cycles timeline list |
| `/{slug}/team/{identifier}/cycles/current` | Redirect to active cycle's detail page |
| `/{slug}/team/{identifier}/cycles/upcoming` | Redirect to next upcoming cycle's detail page |
| `/{slug}/team/{identifier}/cycles/{id}` | Cycle detail with issues + right sidebar |

### Frontend State

- **TanStack Query**: all cycle data (list, detail, progress)
- **Query keys**: `["cycles", teamId]` for list, `["cycles", cycleId]` for detail
- **Mutations**: optimistic updates for cycle CRUD, issue cycle assignment
- **WebSocket**: `cycle:*` events invalidate cycle queries via existing realtime sync

## Future Feature Hooks

The following are explicitly out of scope but the data model supports them:

- **Velocity tracking**: `completed_scope_history` across cycles gives points-per-cycle velocity. Dashboard widget queries `cycle` table ordered by `completed_at` and sums final completed points.
- **Workload per team**: query issues grouped by assignee + cycle, cross-reference with estimate points. Separate team page.
- **Burnout detection**: compare assignee workload across cycles, flag increasing trends. Dashboard widget.
- **Roadmaps**: cross-team timeline view of cycles and projects. Separate top-level menu. Uses `cycle.starts_at`/`ends_at` + `project` data.
- **Dashboard widgets**: all chart data is pre-computed in history arrays, so widgets just read and render.

## Out of Scope

- Velocity/burndown dashboard widgets (separate dashboard feature)
- Workload page (separate team page)
- Roadmaps (separate top-level feature)
- Burnout detection (dashboard widget)
- Cycle templates or recurring cycle customization beyond the existing settings
- Cross-team cycle views
