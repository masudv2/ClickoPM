# CEO Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a workspace-level dashboard at `/:slug/dashboard` for owners/admins showing cross-team health, blockers, velocity trends, and activity.

**Architecture:** Single backend endpoint aggregates data from existing tables (teams, cycles, issues, activity_log). Frontend is a pure TanStack Query page in `packages/views/dashboard/` with Recharts for charts. No new DB tables, no Zustand stores.

**Tech Stack:** Go (Chi, sqlc), React, TanStack Query, Recharts, shadcn/ui, Tailwind

---

### Task 1: Add Dashboard SQL Queries

**Files:**
- Modify: `server/pkg/db/queries/issue.sql`
- Modify: `server/pkg/db/queries/activity.sql`

- [ ] **Step 1: Add GetDashboardStats query**

Add to `server/pkg/db/queries/issue.sql`:

```sql
-- name: GetDashboardStats :one
SELECT
  COUNT(*) FILTER (WHERE status NOT IN ('done', 'cancelled'))::int as open_count,
  COUNT(*) FILTER (WHERE due_date IS NOT NULL AND due_date < NOW() AND status NOT IN ('done', 'cancelled'))::int as overdue_count
FROM issue
WHERE workspace_id = @workspace_id;
```

- [ ] **Step 2: Add GetDashboardBlockers query**

Add to `server/pkg/db/queries/issue.sql`:

```sql
-- name: GetDashboardBlockers :many
SELECT
  i.id, i.workspace_id, i.team_id, i.number, i.title, i.status, i.priority,
  i.assignee_type, i.assignee_id, i.due_date,
  t.identifier as team_identifier, t.name as team_name, t.color as team_color
FROM issue i
JOIN team t ON t.id = i.team_id
WHERE i.workspace_id = @workspace_id
  AND i.status NOT IN ('done', 'cancelled')
  AND (
    (i.priority = 'urgent' AND i.assignee_id IS NULL)
    OR i.status = 'blocked'
    OR (i.due_date IS NOT NULL AND i.due_date < NOW())
  )
ORDER BY
  CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
  i.due_date ASC NULLS LAST;
```

- [ ] **Step 3: Add ListWorkspaceActivities query**

Add to `server/pkg/db/queries/activity.sql`:

```sql
-- name: ListWorkspaceActivities :many
SELECT * FROM activity_log
WHERE workspace_id = @workspace_id
  AND action = ANY(@actions::text[])
ORDER BY created_at DESC
LIMIT @lim OFFSET @off;
```

- [ ] **Step 4: Add ListCompletedCyclesForDashboard query**

Add to `server/pkg/db/queries/cycle.sql`:

```sql
-- name: ListCompletedCyclesForDashboard :many
SELECT c.*, t.name as team_name, t.color as team_color, t.identifier as team_identifier
FROM cycle c
JOIN team t ON t.id = c.team_id
WHERE c.workspace_id = @workspace_id
  AND c.status = 'completed'
ORDER BY c.ends_at DESC
LIMIT @lim;
```

- [ ] **Step 5: Run sqlc generate**

Run: `cd server && make sqlc`

Expected: clean generation, new Go functions appear in `server/pkg/db/generated/`

- [ ] **Step 6: Verify generated code compiles**

Run: `cd server && go build ./...`

Expected: no compilation errors

- [ ] **Step 7: Commit**

```bash
git add server/pkg/db/queries/issue.sql server/pkg/db/queries/activity.sql server/pkg/db/queries/cycle.sql server/pkg/db/generated/
git commit -m "feat(dashboard): add SQL queries for dashboard stats, blockers, activities, and velocity"
```

---

### Task 2: Add Dashboard Go Handler

**Files:**
- Create: `server/internal/handler/dashboard.go`
- Modify: `server/cmd/server/router.go`

- [ ] **Step 1: Create the dashboard handler file**

Create `server/internal/handler/dashboard.go`:

```go
package handler

import (
	"encoding/json"
	"math"
	"net/http"
	"strconv"

	db "multica/pkg/db/generated"
)

// --- Response types ---

type DashboardStatsResponse struct {
	OpenCount      int     `json:"open_count"`
	OverdueCount   int     `json:"overdue_count"`
	CompletionRate float64 `json:"completion_rate"`
	AvgVelocity    float64 `json:"avg_velocity"`
}

type CycleSummaryResponse struct {
	ID                    string         `json:"id"`
	Name                 string         `json:"name"`
	StartsAt             string         `json:"starts_at"`
	EndsAt               string         `json:"ends_at"`
	ScopeCount           int            `json:"scope_count"`
	ScopePoints          int            `json:"scope_points"`
	CompletedCount       int            `json:"completed_count"`
	CompletedPoints      int            `json:"completed_points"`
	ScopeHistory         json.RawMessage `json:"scope_history"`
	CompletedScopeHistory json.RawMessage `json:"completed_scope_history"`
}

type TeamHealthResponse struct {
	TeamID           string                `json:"team_id"`
	TeamName         string                `json:"team_name"`
	TeamColor        string                `json:"team_color"`
	TeamIdentifier   string                `json:"team_identifier"`
	ActiveCycle      *CycleSummaryResponse `json:"active_cycle"`
	Velocity         float64               `json:"velocity"`
	BlockerCount     int                   `json:"blocker_count"`
	EstimatesEnabled bool                  `json:"estimates_enabled"`
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

type DashboardBlockerResponse struct {
	ID             string  `json:"id"`
	Identifier     string  `json:"identifier"`
	Title          string  `json:"title"`
	Status         string  `json:"status"`
	Priority       string  `json:"priority"`
	AssigneeType   *string `json:"assignee_type"`
	AssigneeID     *string `json:"assignee_id"`
	DueDate        *string `json:"due_date"`
	TeamID         string  `json:"team_id"`
	TeamName       string  `json:"team_name"`
	TeamColor      string  `json:"team_color"`
}

type ActivityResponse struct {
	ID        string          `json:"id"`
	IssueID   *string         `json:"issue_id"`
	ActorType string          `json:"actor_type"`
	ActorID   string          `json:"actor_id"`
	Action    string          `json:"action"`
	Details   json.RawMessage `json:"details"`
	CreatedAt string          `json:"created_at"`
}

type DashboardResponse struct {
	Stats    DashboardStatsResponse `json:"stats"`
	Teams    []TeamHealthResponse   `json:"teams"`
	Velocity []VelocityDataPoint    `json:"velocity"`
	Activity []ActivityResponse     `json:"activity"`
	Blockers []DashboardBlockerResponse `json:"blockers"`
}

// --- Handler ---

func (h *Handler) GetDashboard(w http.ResponseWriter, r *http.Request) {
	wsID := ctxWorkspaceID(r.Context())
	if wsID == "" {
		writeError(w, http.StatusBadRequest, "workspace ID required")
		return
	}

	cycleCountStr := r.URL.Query().Get("cycle_count")
	cycleCount := 6
	if cycleCountStr != "" {
		if n, err := strconv.Atoi(cycleCountStr); err == nil && (n == 3 || n == 6 || n == 12) {
			cycleCount = n
		}
	}

	ctx := r.Context()
	wsUUID := parseUUID(wsID)

	// 1. Get stats
	stats, err := h.Queries.GetDashboardStats(ctx, wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get dashboard stats")
		return
	}

	// 2. Get all teams
	teams, err := h.Queries.ListTeams(ctx, wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list teams")
		return
	}

	// 3. Get blockers
	blockers, err := h.Queries.GetDashboardBlockers(ctx, wsUUID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get blockers")
		return
	}

	// 4. Get completed cycles for velocity
	completedCycles, err := h.Queries.ListCompletedCyclesForDashboard(ctx, db.ListCompletedCyclesForDashboardParams{
		WorkspaceID: wsUUID,
		Lim:         int32(cycleCount * len(teams)),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list completed cycles")
		return
	}

	// 5. Get activities
	activities, err := h.Queries.ListWorkspaceActivities(ctx, db.ListWorkspaceActivitiesParams{
		WorkspaceID: wsUUID,
		Actions:     []string{"status_changed", "issue_created", "cycle_status_changed"},
		Lim:         20,
		Off:         0,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list activities")
		return
	}

	// 6. Build per-team health
	blockersByTeam := map[string]int{}
	for _, b := range blockers {
		blockersByTeam[uuidToString(b.TeamID)]++
	}

	// Build velocity data and compute per-team avg velocity
	velocityData := []VelocityDataPoint{}
	teamVelocitySums := map[string][]float64{}
	for _, c := range completedCycles {
		teamID := uuidToString(c.TeamID)
		count, points := extractLastHistoryEntry(c.CompletedScopeHistory)
		velocityData = append(velocityData, VelocityDataPoint{
			TeamID:      teamID,
			TeamName:    c.TeamName,
			TeamColor:   c.TeamColor,
			CycleName:   c.Name,
			CycleNumber: int(c.Number),
			Count:       count,
			Points:      points,
		})
		teamVelocitySums[teamID] = append(teamVelocitySums[teamID], float64(count))
	}

	// Compute completion rate from active cycles
	totalScope := 0
	totalCompleted := 0

	teamHealths := make([]TeamHealthResponse, 0, len(teams))
	for _, team := range teams {
		teamID := uuidToString(team.ID)

		th := TeamHealthResponse{
			TeamID:         teamID,
			TeamName:       team.Name,
			TeamColor:      team.Color.String,
			TeamIdentifier: team.Identifier,
			BlockerCount:   blockersByTeam[teamID],
		}

		// Parse team settings to check estimates
		var settings struct {
			Estimates struct {
				Enabled bool `json:"enabled"`
			} `json:"estimates"`
		}
		if team.Settings != nil {
			json.Unmarshal(team.Settings, &settings)
		}
		th.EstimatesEnabled = settings.Estimates.Enabled

		// Get active cycle
		activeCycle, err := h.Queries.GetActiveCycleForTeam(ctx, team.ID)
		if err == nil {
			snapshot, snapErr := h.Queries.GetCycleScopeSnapshot(ctx, activeCycle.ID)
			if snapErr == nil {
				totalScope += int(snapshot.TotalCount)
				totalCompleted += int(snapshot.CompletedCount)
				th.ActiveCycle = &CycleSummaryResponse{
					ID:                    uuidToString(activeCycle.ID),
					Name:                  activeCycle.Name,
					StartsAt:              timestampToString(activeCycle.StartsAt),
					EndsAt:                timestampToString(activeCycle.EndsAt),
					ScopeCount:            int(snapshot.TotalCount),
					ScopePoints:           int(snapshot.TotalPoints),
					CompletedCount:        int(snapshot.CompletedCount),
					CompletedPoints:       int(snapshot.CompletedPoints),
					ScopeHistory:          activeCycle.ScopeHistory,
					CompletedScopeHistory: activeCycle.CompletedScopeHistory,
				}
			}
		}

		// Avg velocity from last 3 completed cycles
		if vals, ok := teamVelocitySums[teamID]; ok {
			limit := 3
			if len(vals) < limit {
				limit = len(vals)
			}
			sum := 0.0
			for _, v := range vals[:limit] {
				sum += v
			}
			th.Velocity = math.Round(sum/float64(limit)*10) / 10
		}

		teamHealths = append(teamHealths, th)
	}

	completionRate := 0.0
	if totalScope > 0 {
		completionRate = math.Round(float64(totalCompleted)/float64(totalScope)*1000) / 10
	}

	// Avg velocity across all teams
	allVelocities := 0.0
	teamCount := 0
	for _, th := range teamHealths {
		if th.Velocity > 0 {
			allVelocities += th.Velocity
			teamCount++
		}
	}
	avgVelocity := 0.0
	if teamCount > 0 {
		avgVelocity = math.Round(allVelocities/float64(teamCount)*10) / 10
	}

	// Build blocker responses
	blockerResponses := make([]DashboardBlockerResponse, 0, len(blockers))
	for _, b := range blockers {
		blockerResponses = append(blockerResponses, DashboardBlockerResponse{
			ID:           uuidToString(b.ID),
			Identifier:   team_identifier_and_number(b.TeamIdentifier, int(b.Number)),
			Title:        b.Title,
			Status:       b.Status,
			Priority:     b.Priority.String,
			AssigneeType: textToPtr(b.AssigneeType),
			AssigneeID:   uuidToPtr(b.AssigneeID),
			DueDate:      timestampToPtr(b.DueDate),
			TeamID:       uuidToString(b.TeamID),
			TeamName:     b.TeamName,
			TeamColor:    b.TeamColor,
		})
	}

	// Build activity responses
	activityResponses := make([]ActivityResponse, 0, len(activities))
	for _, a := range activities {
		activityResponses = append(activityResponses, ActivityResponse{
			ID:        uuidToString(a.ID),
			IssueID:   uuidToPtr(a.IssueID),
			ActorType: a.ActorType.String,
			ActorID:   uuidToString(a.ActorID),
			Action:    a.Action,
			Details:   a.Details,
			CreatedAt: timestampToString(a.CreatedAt),
		})
	}

	resp := DashboardResponse{
		Stats: DashboardStatsResponse{
			OpenCount:      int(stats.OpenCount),
			OverdueCount:   int(stats.OverdueCount),
			CompletionRate: completionRate,
			AvgVelocity:    avgVelocity,
		},
		Teams:    teamHealths,
		Velocity: velocityData,
		Activity: activityResponses,
		Blockers: blockerResponses,
	}

	writeJSON(w, http.StatusOK, resp)
}

// extractLastHistoryEntry reads the last entry from a scope_history JSONB array.
// Returns (count, points). Returns (0, 0) if the array is empty or nil.
func extractLastHistoryEntry(raw []byte) (int, int) {
	if len(raw) == 0 {
		return 0, 0
	}
	var entries []struct {
		Count  int `json:"count"`
		Points int `json:"points"`
	}
	if err := json.Unmarshal(raw, &entries); err != nil || len(entries) == 0 {
		return 0, 0
	}
	last := entries[len(entries)-1]
	return last.Count, last.Points
}

// team_identifier_and_number builds "MUL-42" from identifier + number.
func team_identifier_and_number(identifier string, number int) string {
	return identifier + "-" + strconv.Itoa(number)
}
```

- [ ] **Step 2: Register the dashboard route**

Add to `server/cmd/server/router.go`, inside the `RequireWorkspaceMember` group, after the cycles routes (around line 341):

```go
			// Dashboard (owner/admin only)
			r.Route("/api/dashboard", func(r chi.Router) {
				r.Use(middleware.RequireWorkspaceRole(queries, "owner", "admin"))
				r.Get("/", h.GetDashboard)
			})
```

- [ ] **Step 3: Verify compilation and adapt to generated types**

Run: `cd server && go build ./...`

The handler code above uses assumed field names. After `make sqlc`, check `server/pkg/db/generated/issue.sql.go` for the actual `GetDashboardBlockersRow` and `GetDashboardStatsRow` struct definitions. Adapt the handler field access to match (e.g. `b.Priority` might be `pgtype.Text` requiring `.String`, or plain `string`). Same for `ListCompletedCyclesForDashboardRow` and `ListWorkspaceActivitiesRow`. Also check that `team.Settings` is `[]byte` -- if it's `pgtype.JSON` or similar, adjust the unmarshal call.

Expected: no errors after adapting field names

- [ ] **Step 4: Commit**

```bash
git add server/internal/handler/dashboard.go server/cmd/server/router.go
git commit -m "feat(dashboard): add dashboard API endpoint with role-based access"
```

---

### Task 3: Add Dashboard TypeScript Types and API Client Method

**Files:**
- Create: `packages/core/types/dashboard.ts`
- Modify: `packages/core/types/index.ts`
- Modify: `packages/core/api/client.ts`

- [ ] **Step 1: Create dashboard types**

Create `packages/core/types/dashboard.ts`:

```typescript
export interface DashboardStats {
  open_count: number;
  overdue_count: number;
  completion_rate: number;
  avg_velocity: number;
}

export interface CycleSummary {
  id: string;
  name: string;
  starts_at: string;
  ends_at: string;
  scope_count: number;
  scope_points: number;
  completed_count: number;
  completed_points: number;
  scope_history: Array<{ date: string; count: number; points: number }>;
  completed_scope_history: Array<{ date: string; count: number; points: number }>;
}

export interface TeamHealth {
  team_id: string;
  team_name: string;
  team_color: string;
  team_identifier: string;
  active_cycle: CycleSummary | null;
  velocity: number;
  blocker_count: number;
  estimates_enabled: boolean;
}

export interface VelocityDataPoint {
  team_id: string;
  team_name: string;
  team_color: string;
  cycle_name: string;
  cycle_number: number;
  count: number;
  points: number;
}

export interface DashboardBlocker {
  id: string;
  identifier: string;
  title: string;
  status: string;
  priority: string;
  assignee_type: string | null;
  assignee_id: string | null;
  due_date: string | null;
  team_id: string;
  team_name: string;
  team_color: string;
}

export interface DashboardActivity {
  id: string;
  issue_id: string | null;
  actor_type: string;
  actor_id: string;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

export interface DashboardData {
  stats: DashboardStats;
  teams: TeamHealth[];
  velocity: VelocityDataPoint[];
  activity: DashboardActivity[];
  blockers: DashboardBlocker[];
}
```

- [ ] **Step 2: Export from types index**

Add to `packages/core/types/index.ts`:

```typescript
export type {
  DashboardStats,
  CycleSummary,
  TeamHealth,
  VelocityDataPoint,
  DashboardBlocker,
  DashboardActivity,
  DashboardData,
} from "./dashboard";
```

- [ ] **Step 3: Add API client method**

Add to `packages/core/api/client.ts`, after the cycles section (after line 1194):

```typescript
  // Dashboard

  async getDashboard(cycleCount: number = 6): Promise<DashboardData> {
    return this.fetch(`/api/dashboard?cycle_count=${cycleCount}`);
  }
```

Also add the import at the top of the file where other types are imported:

```typescript
import type { DashboardData } from "../types";
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm typecheck`

Expected: no type errors

- [ ] **Step 5: Commit**

```bash
git add packages/core/types/dashboard.ts packages/core/types/index.ts packages/core/api/client.ts
git commit -m "feat(dashboard): add TypeScript types and API client method"
```

---

### Task 4: Add Dashboard Query Hook

**Files:**
- Create: `packages/core/dashboard/queries.ts`
- Create: `packages/core/dashboard/index.ts`

- [ ] **Step 1: Create the query module**

Create `packages/core/dashboard/queries.ts`:

```typescript
import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const dashboardKeys = {
  all: (wsId: string) => ["dashboard", wsId] as const,
  data: (wsId: string, cycleCount: number) => [...dashboardKeys.all(wsId), cycleCount] as const,
};

export function dashboardOptions(wsId: string, cycleCount: number = 6) {
  return queryOptions({
    queryKey: dashboardKeys.data(wsId, cycleCount),
    queryFn: () => api.getDashboard(cycleCount),
    enabled: !!wsId,
  });
}
```

- [ ] **Step 2: Create barrel export**

Create `packages/core/dashboard/index.ts`:

```typescript
export { dashboardKeys, dashboardOptions } from "./queries";
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm typecheck`

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/core/dashboard/
git commit -m "feat(dashboard): add TanStack Query hook for dashboard data"
```

---

### Task 5: Add Dashboard Path and Sidebar Nav Item

**Files:**
- Modify: `packages/core/paths/paths.ts`
- Modify: `packages/views/layout/app-sidebar.tsx`

- [ ] **Step 1: Add dashboard path**

In `packages/core/paths/paths.ts`, add `dashboard` to the `workspaceScoped` return object (after `root` on line 20):

```typescript
    root: () => `${ws}/issues`,
    dashboard: () => `${ws}/dashboard`,
    issues: () => `${ws}/issues`,
```

- [ ] **Step 2: Add dashboard to sidebar NavKey type**

In `packages/views/layout/app-sidebar.tsx`, add `"dashboard"` to the `NavKey` union type (around line 95):

```typescript
type NavKey =
  | "dashboard"
  | "inbox"
  | "chat"
  // ... rest of keys
```

- [ ] **Step 3: Add dashboard nav item for owners/admins**

In `packages/views/layout/app-sidebar.tsx`, the dashboard nav item needs role-based visibility. Find the section where `personalNav` is rendered and add a conditional dashboard item above it. This requires importing `LayoutDashboard` from lucide-react and accessing the current member's role.

In the component that renders the sidebar nav sections, add before the personal nav section:

```typescript
import { LayoutDashboard } from "lucide-react";
```

Add a `DashboardNavItem` component to the file:

```typescript
function DashboardNavItem() {
  const wsId = useWorkspaceId();
  const user = useAuthStore((s) => s.user);
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const currentMember = members.find((m) => m.user_id === user?.id);
  const isAdminOrOwner = currentMember?.role === "owner" || currentMember?.role === "admin";
  const p = useWorkspacePaths();
  const pathname = usePathname();

  if (!isAdminOrOwner) return null;

  const href = p.dashboard();
  const isActive = pathname === href;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <AppLink href={href}>
          <LayoutDashboard className="size-4" />
          <span>Dashboard</span>
        </AppLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
```

Render `<DashboardNavItem />` as the first item in the sidebar, above the personal nav section.

- [ ] **Step 4: Verify types compile**

Run: `pnpm typecheck`

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/core/paths/paths.ts packages/views/layout/app-sidebar.tsx
git commit -m "feat(dashboard): add sidebar nav item with role-based visibility"
```

---

### Task 6: Install Recharts

**Files:**
- Modify: `pnpm-workspace.yaml` (catalog entry)
- Modify: `packages/views/package.json`

- [ ] **Step 1: Add recharts to pnpm catalog**

In `pnpm-workspace.yaml`, add to the `catalog:` section:

```yaml
recharts: ^2.15.3
```

- [ ] **Step 2: Install recharts in the views package**

Run: `pnpm --filter @multica/views add recharts@catalog:`

- [ ] **Step 3: Verify install**

Run: `pnpm install`

Expected: clean install, no peer dep warnings

- [ ] **Step 4: Commit**

```bash
git add pnpm-workspace.yaml packages/views/package.json pnpm-lock.yaml
git commit -m "chore: add recharts to views package via pnpm catalog"
```

---

### Task 7: Build Dashboard Page Shell and Header

**Files:**
- Create: `packages/views/dashboard/components/dashboard-page.tsx`
- Create: `packages/views/dashboard/components/dashboard-header.tsx`
- Create: `packages/views/dashboard/index.ts`

- [ ] **Step 1: Create the header component**

Create `packages/views/dashboard/components/dashboard-header.tsx`:

```tsx
"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@multica/ui/components/ui/select";

interface DashboardHeaderProps {
  userName: string;
  cycleCount: number;
  onCycleCountChange: (count: number) => void;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function DashboardHeader({ userName, cycleCount, onCycleCountChange }: DashboardHeaderProps) {
  const firstName = userName.split(" ")[0];

  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-lg font-semibold text-foreground">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-sm text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>
      <Select value={String(cycleCount)} onValueChange={(v) => onCycleCountChange(Number(v))}>
        <SelectTrigger className="w-[160px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="3">Last 3 cycles</SelectItem>
          <SelectItem value="6">Last 6 cycles</SelectItem>
          <SelectItem value="12">Last 12 cycles</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 2: Create the main page component**

Create `packages/views/dashboard/components/dashboard-page.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { useAuthStore } from "@multica/core/auth";
import { memberListOptions } from "@multica/core/workspace/queries";
import { dashboardOptions } from "@multica/core/dashboard";
import { useNavigation } from "@multica/core/platform";
import { useWorkspacePaths } from "@multica/core/paths";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { DashboardHeader } from "./dashboard-header";

export function DashboardPage() {
  const wsId = useWorkspaceId();
  const user = useAuthStore((s) => s.user);
  const { data: members = [] } = useQuery(memberListOptions(wsId));
  const currentMember = members.find((m) => m.user_id === user?.id);
  const navigation = useNavigation();
  const p = useWorkspacePaths();

  const [cycleCount, setCycleCount] = useState(6);
  const { data, isLoading } = useQuery(dashboardOptions(wsId, cycleCount));

  // Redirect non-admin/owner users
  const isAdminOrOwner = currentMember?.role === "owner" || currentMember?.role === "admin";
  if (currentMember && !isAdminOrOwner) {
    navigation.push(p.issues());
    return null;
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
      <DashboardHeader
        userName={user?.name ?? ""}
        cycleCount={cycleCount}
        onCycleCountChange={setCycleCount}
      />

      {data.teams.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">Create your first team to see dashboard metrics</p>
        </div>
      ) : (
        <>
          {/* Stats section - Task 8 */}
          {/* Team health grid - Task 9 */}
          {/* Velocity chart - Task 10 */}
          {/* Activity feed - Task 11 */}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create barrel export**

Create `packages/views/dashboard/index.ts`:

```typescript
export { DashboardPage } from "./components/dashboard-page";
```

- [ ] **Step 4: Verify types compile**

Run: `pnpm typecheck`

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add packages/views/dashboard/
git commit -m "feat(dashboard): add page shell with header, loading skeleton, and role guard"
```

---

### Task 8: Build Stat Cards and Completion Breakdown

**Files:**
- Create: `packages/views/dashboard/components/dashboard-stats.tsx`
- Modify: `packages/views/dashboard/components/dashboard-page.tsx`

- [ ] **Step 1: Create the stats component**

Create `packages/views/dashboard/components/dashboard-stats.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { DashboardStats, TeamHealth, DashboardBlocker } from "@multica/core/types";
import { Card, CardContent } from "@multica/ui/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@multica/ui/components/ui/sheet";
import { Badge } from "@multica/ui/components/ui/badge";
import { AppLink } from "@multica/core/platform";
import { useWorkspacePaths } from "@multica/core/paths";

const TEAM_COLOR_MAP: Record<string, string> = {
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  yellow: "bg-yellow-500",
  lime: "bg-lime-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  gray: "bg-gray-500",
};

interface DashboardStatsProps {
  stats: DashboardStats;
  teams: TeamHealth[];
  blockers: DashboardBlocker[];
}

export function DashboardStatsSection({ stats, teams, blockers }: DashboardStatsProps) {
  const [overdueOpen, setOverdueOpen] = useState(false);
  const p = useWorkspacePaths();

  const overdueBlockers = blockers.filter(
    (b) => b.due_date && new Date(b.due_date) < new Date() && b.status !== "done" && b.status !== "cancelled",
  );

  const statCards = [
    { label: "Open Issues", value: stats.open_count, color: "text-foreground" },
    {
      label: "Overdue",
      value: stats.overdue_count,
      color: stats.overdue_count > 0 ? "text-destructive" : "text-foreground",
      clickable: true,
    },
    {
      label: "Completion Rate",
      value: `${stats.completion_rate}%`,
      color: "text-emerald-500",
    },
    { label: "Avg Velocity", value: stats.avg_velocity, color: "text-foreground" },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card
            key={card.label}
            className={card.clickable ? "cursor-pointer transition-colors hover:bg-muted/50" : ""}
            onClick={card.clickable ? () => setOverdueOpen(true) : undefined}
          >
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{card.label}</p>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Completion breakdown bar */}
      {teams.length > 0 && (
        <div className="flex h-2 overflow-hidden rounded-full bg-muted">
          {teams
            .filter((t) => t.active_cycle)
            .map((t) => {
              const totalScope = teams.reduce((sum, team) => sum + (team.active_cycle?.scope_count ?? 0), 0);
              const width = totalScope > 0 ? ((t.active_cycle?.completed_count ?? 0) / totalScope) * 100 : 0;
              return (
                <div
                  key={t.team_id}
                  className={`${TEAM_COLOR_MAP[t.team_color] ?? "bg-blue-500"} transition-all`}
                  style={{ width: `${width}%` }}
                  title={`${t.team_name}: ${t.active_cycle?.completed_count ?? 0} completed`}
                />
              );
            })}
        </div>
      )}

      {/* Overdue sheet */}
      <Sheet open={overdueOpen} onOpenChange={setOverdueOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Overdue Issues ({overdueBlockers.length})</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {overdueBlockers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No overdue issues</p>
            ) : (
              overdueBlockers.map((b) => {
                const daysOverdue = Math.ceil(
                  (Date.now() - new Date(b.due_date!).getTime()) / (1000 * 60 * 60 * 24),
                );
                return (
                  <div key={b.id} className="flex items-start justify-between gap-2 rounded-md border p-3">
                    <div className="min-w-0 flex-1">
                      <AppLink
                        href={p.issueDetail(b.id)}
                        className="text-sm font-medium text-foreground hover:underline"
                      >
                        {b.identifier}
                      </AppLink>
                      <p className="truncate text-sm text-muted-foreground">{b.title}</p>
                      <p className="text-xs text-muted-foreground">{b.team_name}</p>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      {daysOverdue}d overdue
                    </Badge>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
```

- [ ] **Step 2: Wire stats into dashboard page**

In `packages/views/dashboard/components/dashboard-page.tsx`, replace the `{/* Stats section - Task 8 */}` comment with:

```tsx
          <DashboardStatsSection stats={data.stats} teams={data.teams} blockers={data.blockers} />
```

Add the import:

```typescript
import { DashboardStatsSection } from "./dashboard-stats";
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm typecheck`

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/views/dashboard/components/dashboard-stats.tsx packages/views/dashboard/components/dashboard-page.tsx
git commit -m "feat(dashboard): add stat cards with overdue issues sheet"
```

---

### Task 9: Build Team Health Cards with Sparkline and Blocker Popover

**Files:**
- Create: `packages/views/dashboard/components/team-health-card.tsx`
- Create: `packages/views/dashboard/components/burndown-sparkline.tsx`
- Create: `packages/views/dashboard/components/blocker-popover.tsx`
- Create: `packages/views/dashboard/components/team-health-grid.tsx`
- Modify: `packages/views/dashboard/components/dashboard-page.tsx`

- [ ] **Step 1: Create the burndown sparkline**

Create `packages/views/dashboard/components/burndown-sparkline.tsx`:

```tsx
"use client";

import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface SparklineProps {
  scopeHistory: Array<{ date: string; count: number; points: number }>;
  completedHistory: Array<{ date: string; count: number; points: number }>;
  usePoints: boolean;
}

export function BurndownSparkline({ scopeHistory, completedHistory, usePoints }: SparklineProps) {
  if (scopeHistory.length === 0) return null;

  const field = usePoints ? "points" : "count";

  // Build merged data: scope minus completed = remaining
  const data = scopeHistory.map((entry, i) => {
    const completed = completedHistory[i]?.[field] ?? 0;
    return {
      date: entry.date,
      remaining: entry[field] - completed,
    };
  });

  return (
    <ResponsiveContainer width="100%" height={32}>
      <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Area
          type="monotone"
          dataKey="remaining"
          stroke="hsl(var(--primary))"
          fill="hsl(var(--primary) / 0.1)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Create the blocker popover**

Create `packages/views/dashboard/components/blocker-popover.tsx`:

```tsx
"use client";

import type { DashboardBlocker } from "@multica/core/types";
import { Popover, PopoverContent, PopoverTrigger } from "@multica/ui/components/ui/popover";
import { Badge } from "@multica/ui/components/ui/badge";
import { AppLink } from "@multica/core/platform";
import { useWorkspacePaths } from "@multica/core/paths";
import { AlertTriangle, Check } from "lucide-react";

interface BlockerPopoverProps {
  teamId: string;
  blockerCount: number;
  blockers: DashboardBlocker[];
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "text-red-500",
  high: "text-orange-500",
  medium: "text-yellow-500",
  low: "text-blue-500",
};

export function BlockerPopover({ teamId, blockerCount, blockers }: BlockerPopoverProps) {
  const p = useWorkspacePaths();
  const teamBlockers = blockers.filter((b) => b.team_id === teamId);

  if (blockerCount === 0) {
    return (
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Check className="size-3 text-emerald-500" />
        No blockers
      </span>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="flex items-center gap-1 text-xs text-destructive hover:underline">
          <AlertTriangle className="size-3" />
          {blockerCount} blocker{blockerCount !== 1 ? "s" : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-2">
          <p className="text-sm font-medium">Blockers</p>
          {teamBlockers.map((b) => (
            <div key={b.id} className="flex items-start gap-2 rounded border p-2">
              <div className="min-w-0 flex-1">
                <AppLink href={p.issueDetail(b.id)} className="text-sm font-medium hover:underline">
                  {b.identifier}
                </AppLink>
                <p className="truncate text-xs text-muted-foreground">{b.title}</p>
              </div>
              <Badge variant="outline" className={`shrink-0 text-xs ${PRIORITY_COLORS[b.priority] ?? ""}`}>
                {b.priority}
              </Badge>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
```

- [ ] **Step 3: Create the team health card**

Create `packages/views/dashboard/components/team-health-card.tsx`:

```tsx
"use client";

import type { TeamHealth, DashboardBlocker } from "@multica/core/types";
import { Card, CardContent } from "@multica/ui/components/ui/card";
import { Progress } from "@multica/ui/components/ui/progress";
import { BurndownSparkline } from "./burndown-sparkline";
import { BlockerPopover } from "./blocker-popover";

const TEAM_BORDER_MAP: Record<string, string> = {
  red: "border-l-red-500",
  orange: "border-l-orange-500",
  amber: "border-l-amber-500",
  yellow: "border-l-yellow-500",
  lime: "border-l-lime-500",
  green: "border-l-green-500",
  teal: "border-l-teal-500",
  blue: "border-l-blue-500",
  indigo: "border-l-indigo-500",
  purple: "border-l-purple-500",
  pink: "border-l-pink-500",
  gray: "border-l-gray-500",
};

interface TeamHealthCardProps {
  team: TeamHealth;
  blockers: DashboardBlocker[];
}

export function TeamHealthCard({ team, blockers }: TeamHealthCardProps) {
  const borderClass = TEAM_BORDER_MAP[team.team_color] ?? "border-l-blue-500";
  const cycle = team.active_cycle;

  const progress = cycle && cycle.scope_count > 0
    ? Math.round((cycle.completed_count / cycle.scope_count) * 100)
    : 0;

  return (
    <Card className={`border-l-4 ${borderClass}`}>
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="font-medium text-foreground">{team.team_name}</p>
          {cycle ? (
            <p className="text-xs text-muted-foreground">
              {cycle.name} &middot;{" "}
              {new Date(cycle.starts_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              {" - "}
              {new Date(cycle.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No active cycle</p>
          )}
        </div>

        {cycle ? (
          <>
            <div>
              <Progress value={progress} className="h-1.5" />
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>{progress}% complete</span>
                <span>Vel: {team.velocity}</span>
              </div>
            </div>

            <BurndownSparkline
              scopeHistory={cycle.scope_history ?? []}
              completedHistory={cycle.completed_scope_history ?? []}
              usePoints={team.estimates_enabled}
            />
          </>
        ) : null}

        <BlockerPopover teamId={team.team_id} blockerCount={team.blocker_count} blockers={blockers} />
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Create the grid container**

Create `packages/views/dashboard/components/team-health-grid.tsx`:

```tsx
"use client";

import type { TeamHealth, DashboardBlocker } from "@multica/core/types";
import { TeamHealthCard } from "./team-health-card";

interface TeamHealthGridProps {
  teams: TeamHealth[];
  blockers: DashboardBlocker[];
}

export function TeamHealthGrid({ teams, blockers }: TeamHealthGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {teams.map((team) => (
        <TeamHealthCard key={team.team_id} team={team} blockers={blockers} />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Wire into dashboard page**

In `packages/views/dashboard/components/dashboard-page.tsx`, replace `{/* Team health grid - Task 9 */}` with:

```tsx
          <TeamHealthGrid teams={data.teams} blockers={data.blockers} />
```

Add the import:

```typescript
import { TeamHealthGrid } from "./team-health-grid";
```

- [ ] **Step 6: Verify types compile**

Run: `pnpm typecheck`

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add packages/views/dashboard/components/
git commit -m "feat(dashboard): add team health cards with sparkline and blocker popover"
```

---

### Task 10: Build Velocity Chart

**Files:**
- Create: `packages/views/dashboard/components/velocity-chart.tsx`
- Modify: `packages/views/dashboard/components/dashboard-page.tsx`

- [ ] **Step 1: Create the velocity chart component**

Create `packages/views/dashboard/components/velocity-chart.tsx`:

```tsx
"use client";

import type { VelocityDataPoint } from "@multica/core/types";
import { Card, CardContent, CardHeader, CardTitle } from "@multica/ui/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const TEAM_CHART_COLORS: Record<string, string> = {
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  teal: "#14b8a6",
  blue: "#3b82f6",
  indigo: "#6366f1",
  purple: "#a855f7",
  pink: "#ec4899",
  gray: "#6b7280",
};

interface VelocityChartProps {
  velocity: VelocityDataPoint[];
}

export function VelocityChart({ velocity }: VelocityChartProps) {
  if (velocity.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-48 items-center justify-center">
          <p className="text-sm text-muted-foreground">Complete your first cycle to see velocity trends</p>
        </CardContent>
      </Card>
    );
  }

  // Group by cycle, pivot teams into columns
  const teamIds = [...new Set(velocity.map((v) => v.team_id))];
  const teamMeta = new Map(velocity.map((v) => [v.team_id, { name: v.team_name, color: v.team_color }]));
  const cycleMap = new Map<number, Record<string, number>>();

  for (const v of velocity) {
    if (!cycleMap.has(v.cycle_number)) {
      cycleMap.set(v.cycle_number, { cycle: v.cycle_number } as Record<string, number>);
    }
    const entry = cycleMap.get(v.cycle_number)!;
    entry[v.team_id] = v.count;
  }

  // Sort by cycle number ascending
  const chartData = [...cycleMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([num, entry]) => ({ ...entry, cycleName: `Cycle ${num}` }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Velocity by Team</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
            <XAxis dataKey="cycleName" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: "12px",
                color: "hsl(var(--popover-foreground))",
              }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }}
            />
            {teamIds.map((teamId) => {
              const meta = teamMeta.get(teamId)!;
              return (
                <Bar
                  key={teamId}
                  dataKey={teamId}
                  name={meta.name}
                  fill={TEAM_CHART_COLORS[meta.color] ?? "#3b82f6"}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={40}
                />
              );
            })}
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire into dashboard page**

In `packages/views/dashboard/components/dashboard-page.tsx`, replace `{/* Velocity chart - Task 10 */}` with:

```tsx
          <VelocityChart velocity={data.velocity} />
```

Add the import:

```typescript
import { VelocityChart } from "./velocity-chart";
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm typecheck`

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/views/dashboard/components/velocity-chart.tsx packages/views/dashboard/components/dashboard-page.tsx
git commit -m "feat(dashboard): add velocity bar chart with per-team breakdown"
```

---

### Task 11: Build Activity Feed

**Files:**
- Create: `packages/views/dashboard/components/activity-feed.tsx`
- Modify: `packages/views/dashboard/components/dashboard-page.tsx`

- [ ] **Step 1: Create the activity feed component**

Create `packages/views/dashboard/components/activity-feed.tsx`:

```tsx
"use client";

import type { DashboardActivity } from "@multica/core/types";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { memberListOptions } from "@multica/core/workspace/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@multica/ui/components/ui/card";
import { CheckCircle2, PlusCircle, AlertCircle, RefreshCw } from "lucide-react";

interface ActivityFeedProps {
  activities: DashboardActivity[];
}

const ACTION_CONFIG: Record<string, { icon: typeof CheckCircle2; label: string }> = {
  status_changed: { icon: RefreshCw, label: "Status changed" },
  issue_created: { icon: PlusCircle, label: "Issue created" },
  cycle_status_changed: { icon: AlertCircle, label: "Cycle updated" },
};

export function ActivityFeed({ activities }: ActivityFeedProps) {
  const wsId = useWorkspaceId();
  const { data: members = [] } = useQuery(memberListOptions(wsId));

  const getMemberName = (actorType: string, actorId: string) => {
    if (actorType === "member") {
      const m = members.find((m) => m.user_id === actorId);
      return m?.name ?? "Unknown";
    }
    if (actorType === "system") return "System";
    return "Agent";
  };

  if (activities.length === 0) {
    return (
      <Card>
        <CardContent className="flex h-32 items-center justify-center">
          <p className="text-sm text-muted-foreground">No recent activity</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {activities.map((activity) => {
          const config = ACTION_CONFIG[activity.action] ?? ACTION_CONFIG.status_changed;
          const Icon = config.icon;
          const details = activity.details as Record<string, string>;
          const timeAgo = getTimeAgo(activity.created_at);

          return (
            <div key={activity.id} className="flex items-start gap-3 rounded-md p-2 hover:bg-muted/50">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{getMemberName(activity.actor_type, activity.actor_id)}</span>
                  {" "}
                  {formatAction(activity.action, details)}
                </p>
                <p className="text-xs text-muted-foreground">{timeAgo}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function formatAction(action: string, details: Record<string, string>): string {
  switch (action) {
    case "status_changed":
      return `changed status to ${details.to ?? "unknown"}`;
    case "issue_created":
      return `created an issue`;
    case "cycle_status_changed":
      return `updated cycle status`;
    default:
      return action.replace(/_/g, " ");
  }
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
```

- [ ] **Step 2: Wire into dashboard page**

In `packages/views/dashboard/components/dashboard-page.tsx`, replace `{/* Activity feed - Task 11 */}` with:

```tsx
          <ActivityFeed activities={data.activity} />
```

Add the import:

```typescript
import { ActivityFeed } from "./activity-feed";
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm typecheck`

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add packages/views/dashboard/components/activity-feed.tsx packages/views/dashboard/components/dashboard-page.tsx
git commit -m "feat(dashboard): add activity feed with time-ago formatting"
```

---

### Task 12: Wire Routes in Web and Desktop Apps

**Files:**
- Create: `apps/web/app/[workspaceSlug]/(dashboard)/dashboard/page.tsx`
- Modify: `apps/desktop/src/renderer/src/routes.tsx`

- [ ] **Step 1: Create web route**

Create `apps/web/app/[workspaceSlug]/(dashboard)/dashboard/page.tsx`:

```tsx
"use client";

import { DashboardPage } from "@multica/views/dashboard";

export default function WorkspaceDashboardPage() {
  return <DashboardPage />;
}
```

- [ ] **Step 2: Add desktop route**

In `apps/desktop/src/renderer/src/routes.tsx`, add a route inside the `:workspaceSlug` children array (after the `index` route, around line 84):

```typescript
          {
            path: "dashboard",
            element: <DashboardPage />,
            handle: { title: "Dashboard" },
          },
```

Add the import at the top of the file:

```typescript
import { DashboardPage } from "@multica/views/dashboard";
```

- [ ] **Step 3: Verify types compile**

Run: `pnpm typecheck`

Expected: no errors

- [ ] **Step 4: Verify Go builds**

Run: `cd server && go build ./...`

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/[workspaceSlug]/(dashboard)/dashboard/page.tsx apps/desktop/src/renderer/src/routes.tsx
git commit -m "feat(dashboard): wire dashboard routes in web and desktop apps"
```

---

### Task 13: End-to-End Smoke Test

**Files:** none (verification only)

- [ ] **Step 1: Start the dev environment**

Run: `make dev`

Expected: backend + frontend start without errors

- [ ] **Step 2: Navigate to dashboard**

Open `http://localhost:3000/{your-workspace-slug}/dashboard` in a browser.

Expected:
- If logged in as owner/admin: dashboard page renders with greeting, stat cards, team health cards (or empty state), velocity chart (or empty state), and activity feed
- If logged in as member: redirected to issues page

- [ ] **Step 3: Verify cycle range selector**

Change the dropdown from "Last 6 cycles" to "Last 3 cycles".

Expected: velocity chart updates (or stays empty if no completed cycles)

- [ ] **Step 4: Test blocker popover**

If any team has blockers, click the blocker count on a team health card.

Expected: popover opens showing blocker issues with identifiers, titles, and priority badges

- [ ] **Step 5: Test overdue sheet**

If there are overdue issues, click the "Overdue" stat card.

Expected: sheet slides open showing overdue issues with days-overdue badges

- [ ] **Step 6: Verify sidebar**

Check the sidebar navigation.

Expected: "Dashboard" item visible for owner/admin, not visible for regular members

- [ ] **Step 7: Run full checks**

Run: `make check`

Expected: all checks pass (typecheck, unit tests, Go tests)
