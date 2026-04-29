# CEO Dashboard Design Spec

## Overview

A bird's-eye view page at `/:slug/dashboard` for workspace owners and admins to see all teams at a glance without drilling into each one. Aggregates cycle progress, blockers, velocity trends, and recent activity across all teams.

## Access Control

- **Route:** `/:slug/dashboard`
- **Allowed roles:** workspace `owner` and `admin` only
- **Denied behavior:** regular `member` role is silently redirected to `/:slug/issues`
- **Sidebar:** "Dashboard" nav item only renders for owner/admin roles

## Page Layout

Top-down information hierarchy (Layout A):

1. **Header** -- greeting + cycle range selector
2. **Stat cards row** -- 4 aggregate numbers + completion breakdown chart
3. **Team health card grid** -- one card per team
4. **Velocity chart** -- grouped bar chart of completed work per cycle per team
5. **Activity feed** -- recent significant events

## Sections

### Header

- Greeting: "Good morning/afternoon/evening, {firstName}" based on browser local time
- Date range dropdown: "Last 3 cycles", "Last 6 cycles" (default), "Last 12 cycles"
- Dropdown controls the velocity chart and avg velocity stat only; team cards always show current active cycle

### Stat Cards

Four stat cards in a row:

| Card | Value | Source |
|---|---|---|
| Open Issues | Count of all non-done/cancelled issues in workspace | `GetDashboardStats` |
| Overdue | Count of issues past `due_date` and not done/cancelled | `GetDashboardStats` |
| Completion Rate | completed / total scope across all active cycles | Derived from `GetCycleScopeSnapshot` per active cycle |
| Avg Velocity | Average completed issues/points per cycle across teams (over selected range) | Derived from completed cycle history |

**Overdue card is clickable:** opens a shadcn Sheet (slide-over from right) listing all overdue issues:
- Columns: identifier (link), title, team name, assignee avatar, due date, days overdue
- Sorted by most overdue first
- Clicking identifier navigates to issue detail
- Empty state: "No overdue issues"

**Completion breakdown chart:** small horizontal stacked bar below the stat cards showing per-team contribution to the overall completion rate. Each segment colored by `team.color`.

### Team Health Cards

Grid of cards (2 columns on desktop, 1 on mobile), one per team. Sorted by `team.position`.

Each card contains:
- Team name with colored left border (from `team.color`)
- Current active cycle name + date range
- Progress bar (shadcn `Progress`) showing completed/scope ratio
- Velocity: avg issues/points completed per cycle (last 3 completed cycles)
- Blocker count (clickable)
- Mini burndown sparkline

**Sparkline logic:**
- Uses `scope_history` and `completed_scope_history` from the active cycle
- Auto-detects display mode: uses points if `team.settings.estimates.enabled` is true, otherwise count
- Rendered as a tiny Recharts `<AreaChart>` or `<LineChart>` with no axes

**Blocker count popover:**
- Click expands a shadcn Popover listing that team's blocker issues
- Blocker definition: `priority = 'urgent' AND assignee_id IS NULL` OR `status = 'blocked'` OR `due_date < now AND status NOT IN ('done', 'cancelled')`
- Each row: identifier (link), title (truncated), priority badge, due date if overdue
- Empty state: "No blockers" with check icon

**No active cycle state:** card shows "No active cycle" with muted styling, no progress bar or sparkline.

### Velocity Chart

Grouped bar chart showing completed work per cycle per team over the selected range.

- X-axis: cycle names/numbers
- Y-axis: completed count or points (auto-detect same as sparkline)
- One bar color per team (from `team.color`)
- Hover tooltip: team name, cycle name, count/points completed
- If a team has fewer completed cycles than the range, it shows fewer bars (no padding)
- Empty state: "Complete your first cycle to see velocity trends"

**Library:** Recharts, styled with design tokens.

### Activity Feed

Recent significant events across all teams. Paginated (20 items, cursor-based).

**Included event types:**
- `issue.status_changed` (to done, blocked, cancelled)
- `issue.created`
- `cycle.status_changed`

**Excluded:** comment edits, label changes, assignment changes, and other low-signal events.

## Data Layer

### API Endpoint

```
GET /api/workspaces/:wsId/dashboard?cycle_count=6
```

- `cycle_count`: 3, 6, or 12 (default 6)
- Auth: workspace membership with role `owner` or `admin`
- Single endpoint, single round-trip

### Response Shape

```go
type DashboardResponse struct {
    Stats       DashboardStats       `json:"stats"`
    Teams       []TeamHealth         `json:"teams"`
    Velocity    []VelocityDataPoint  `json:"velocity"`
    Activity    []ActivityEntry      `json:"activity"`
    Blockers    []DashboardIssue     `json:"blockers"`
}

type DashboardStats struct {
    OpenCount      int     `json:"open_count"`
    OverdueCount   int     `json:"overdue_count"`
    CompletionRate float64 `json:"completion_rate"`
    AvgVelocity    float64 `json:"avg_velocity"`
}

type TeamHealth struct {
    TeamID             string          `json:"team_id"`
    TeamName           string          `json:"team_name"`
    TeamColor          string          `json:"team_color"`
    TeamIdentifier     string          `json:"team_identifier"`
    ActiveCycle        *CycleSummary   `json:"active_cycle"`  // null if no active cycle
    Velocity           float64         `json:"velocity"`      // avg over last 3 completed
    BlockerCount       int             `json:"blocker_count"`
    EstimatesEnabled   bool            `json:"estimates_enabled"`
}

type CycleSummary struct {
    ID                    string         `json:"id"`
    Name                  string         `json:"name"`
    StartsAt              string         `json:"starts_at"`
    EndsAt                string         `json:"ends_at"`
    ScopeCount            int            `json:"scope_count"`
    ScopePoints           int            `json:"scope_points"`
    CompletedCount        int            `json:"completed_count"`
    CompletedPoints       int            `json:"completed_points"`
    ScopeHistory          []HistoryEntry `json:"scope_history"`
    CompletedScopeHistory []HistoryEntry `json:"completed_scope_history"`
}

type VelocityDataPoint struct {
    TeamID      string `json:"team_id"`
    TeamName    string `json:"team_name"`
    TeamColor   string `json:"team_color"`
    CycleName   string `json:"cycle_name"`
    CycleNumber int    `json:"cycle_number"`
    Count       int    `json:"count"`
    Points      int    `json:"points"`
}

type DashboardIssue struct {
    ID           string  `json:"id"`
    Identifier   string  `json:"identifier"`
    Title        string  `json:"title"`
    Status       string  `json:"status"`
    Priority     string  `json:"priority"`
    AssigneeType *string `json:"assignee_type"`
    AssigneeID   *string `json:"assignee_id"`
    DueDate      *string `json:"due_date"`
    TeamID       string  `json:"team_id"`
    TeamName     string  `json:"team_name"`
    TeamColor    string  `json:"team_color"`
}
```

### New SQL Queries

**`GetDashboardBlockers`:**
```sql
SELECT i.*, t.identifier as team_identifier, t.name as team_name, t.color as team_color
FROM issue i
JOIN team t ON t.id = i.team_id
WHERE i.workspace_id = @workspace_id
  AND i.status NOT IN ('done', 'cancelled')
  AND (
    (i.priority = 'urgent' AND i.assignee_id IS NULL)
    OR i.status = 'blocked'
    OR (i.due_date IS NOT NULL AND i.due_date < NOW())
  )
ORDER BY i.priority DESC, i.due_date ASC NULLS LAST
```

**`GetDashboardStats`:**
```sql
SELECT
  COUNT(*) FILTER (WHERE status NOT IN ('done', 'cancelled')) as open_count,
  COUNT(*) FILTER (WHERE due_date < NOW() AND status NOT IN ('done', 'cancelled')) as overdue_count
FROM issue
WHERE workspace_id = @workspace_id
```

**`ListCompletedCyclesForDashboard`:**
```sql
SELECT c.*, t.name as team_name, t.color as team_color, t.identifier as team_identifier
FROM cycle c
JOIN team t ON t.id = c.team_id
WHERE c.workspace_id = @workspace_id
  AND c.status = 'completed'
ORDER BY c.ends_at DESC
LIMIT @limit
```

### Existing Queries Reused

- `ListTeams` -- team list
- `GetActiveCycleForTeam` -- per-team active cycle
- `GetCycleScopeSnapshot` -- scope/completed/started counts for active cycles
- `ListActivityLogs` -- activity feed (filtered server-side to significant actions)

### Velocity Computation (Go handler)

For each completed cycle, extract the last entry from `completed_scope_history` JSONB array. That gives `{count, points}` -- the total completed work for that cycle. Group by team. Avg velocity per team = mean of those values over the last 3 completed cycles.

## Frontend Architecture

### Component Location

All components in `packages/views/dashboard/` (shared between web and desktop).

```
packages/views/dashboard/
├── components/
│   ├── dashboard-page.tsx         # Main page component
│   ├── dashboard-header.tsx       # Greeting + range selector
│   ├── dashboard-stats.tsx        # Stat cards row + breakdown chart
│   ├── team-health-grid.tsx       # Grid container
│   ├── team-health-card.tsx       # Individual team card
│   ├── burndown-sparkline.tsx     # Mini chart component
│   ├── velocity-chart.tsx         # Grouped bar chart
│   ├── activity-feed.tsx          # Event list
│   ├── blocker-popover.tsx        # Team blocker list
│   └── overdue-sheet.tsx          # Overdue issues slide-over
└── index.ts                       # Barrel export
```

### State Management

- **TanStack Query only** -- no Zustand stores
- Query key: `['dashboard', wsId, cycleCount]`
- Cycle range selector is local `useState` (ephemeral)
- Re-fetch on `cycleCount` change is automatic via query key

### Charting

**Library:** Recharts

Components used:
- `BurndownSparkline` -- `<AreaChart>` with no axes, just fill
- `VelocityChart` -- `<BarChart>` grouped by cycle
- `CompletionBreakdownChart` -- horizontal `<BarChart>` stacked

All charts styled with CSS variables from the design system. Team colors mapped from `team.color` field to design token values.

### Styling

- All components use shadcn + Tailwind with semantic design tokens
- No hardcoded colors -- team colors mapped through a utility: `teamColorToClass(color: string) => string`
- Responsive: 2-column card grid on desktop, 1-column on mobile
- shadcn components used: `Progress`, `Sheet`, `Popover`, `Select`, `Card`, `Badge`, `Skeleton`

### Loading States

- Skeleton loading for stat cards (4 rectangles), team cards (2-3 cards), chart placeholder
- Skeletons use shadcn `Skeleton` component

### Empty States

| Condition | Display |
|---|---|
| No teams in workspace | "Create your first team to see dashboard metrics" with link |
| No active cycle for a team | Card shows "No active cycle" muted |
| No completed cycles | Velocity chart: "Complete your first cycle to see velocity trends" |
| No blockers for a team | Popover: "No blockers" with check icon |
| No overdue issues | Sheet: "No overdue issues" |

### Routing

- **Web:** `apps/web/app/(dashboard)/[slug]/dashboard/page.tsx` -- thin wrapper rendering `<DashboardPage />`
- **Desktop:** add route to desktop router under `/:slug/dashboard`
- Sidebar nav item "Dashboard" added for owner/admin roles only

## Design Constraints

- Must use Multica design system (shadcn + semantic tokens) for all UI
- Charts must be clean and visually consistent with the rest of the app
- No new Zustand stores
- No new database tables
- Single API endpoint for the entire page
- Access gated to owner/admin only

## Out of Scope

- Team card click-through to cycle detail (future enhancement)
- Cross-workspace aggregation (would require `/ceo` global route)
- Individual contributor metrics (workload view feature)
- Team comparison rankings
- Notifications/alerts (inbox covers this)
- Daily reports integration (separate feature)
