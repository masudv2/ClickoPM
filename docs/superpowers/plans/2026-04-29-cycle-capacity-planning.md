# Cycle Capacity Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show per-assignee capacity utilization in the cycle sidebar and assignee picker so leads can plan sprint assignments without leaving the cycle page.

**Architecture:** Add a new SQL query to compute per-assignee completed points from historical cycles. The Go handler computes per-assignee velocity and capacity_percent, returning them on each assignee breakdown item. Frontend reads these new fields to render capacity bars in the sidebar and capacity badges in the assignee picker.

**Tech Stack:** Go (backend handler), PostgreSQL (sqlc), TypeScript/React (frontend components), TanStack Query (data fetching)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/pkg/db/queries/cycle.sql` | Modify | Add per-assignee historical points query |
| `server/pkg/db/generated/cycle.sql.go` | Regenerate | sqlc output |
| `server/internal/handler/cycle.go` | Modify | Compute per-assignee velocity + capacity_percent |
| `packages/core/types/cycle.ts` | Modify | Add `velocity` and `capacity_percent` to `BreakdownItem` |
| `packages/views/cycles/components/cycle-breakdown-tabs.tsx` | Modify | Add capacity bar to assignee rows |
| `packages/views/issues/components/pickers/assignee-picker.tsx` | Modify | Add optional `capacityMap` prop, render capacity badge |
| `packages/views/issues/components/issue-detail.tsx` | Modify | Query cycle data, build capacityMap, pass to AssigneePicker |

---

### Task 1: Add per-assignee historical points SQL query

**Files:**
- Modify: `server/pkg/db/queries/cycle.sql`
- Regenerate: `server/pkg/db/generated/cycle.sql.go`

- [ ] **Step 1: Add the SQL query**

Add this query at the end of `server/pkg/db/queries/cycle.sql`, after the `GetLastCompletedCyclesForTeam` query (after line 155):

```sql
-- name: GetAssigneePointsForCompletedCycles :many
-- Returns total completed points per assignee across the last N completed cycles for a team.
SELECT
    i.assignee_type,
    i.assignee_id,
    COALESCE(SUM(i.estimate) FILTER (WHERE i.status IN ('done', 'cancelled')), 0)::integer AS completed_points
FROM issue i
JOIN cycle c ON c.id = i.cycle_id
WHERE c.team_id = $1
  AND c.status = 'completed'
  AND c.completed_at IS NOT NULL
  AND c.completed_at >= (
      SELECT COALESCE(MIN(sub.completed_at), '1970-01-01'::timestamptz)
      FROM (
          SELECT completed_at FROM cycle
          WHERE team_id = $1 AND status = 'completed'
          ORDER BY completed_at DESC
          LIMIT 3
      ) sub
  )
  AND i.assignee_id IS NOT NULL
GROUP BY i.assignee_type, i.assignee_id;
```

- [ ] **Step 2: Regenerate sqlc**

Run:
```bash
make sqlc
```

Expected: No errors. New function `GetAssigneePointsForCompletedCycles` appears in `server/pkg/db/generated/cycle.sql.go`.

- [ ] **Step 3: Verify generated code compiles**

Run:
```bash
cd server && go build ./...
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/pkg/db/queries/cycle.sql server/pkg/db/generated/cycle.sql.go
git commit -m "feat(cycles): add per-assignee historical points query"
```

---

### Task 2: Compute per-assignee velocity and capacity in GetCycle handler

**Files:**
- Modify: `server/internal/handler/cycle.go:58-69` (BreakdownItem struct)
- Modify: `server/internal/handler/cycle.go:212-226` (assignee breakdown population)

- [ ] **Step 1: Add velocity and capacity_percent fields to BreakdownItem**

In `server/internal/handler/cycle.go`, add two fields to the `BreakdownItem` struct (after `Percent` on line 68):

```go
type BreakdownItem struct {
	ID              string `json:"id,omitempty"`
	ActorType       string `json:"actor_type,omitempty"`
	Name            string `json:"name,omitempty"`
	Priority        string `json:"priority,omitempty"`
	Icon            string `json:"icon,omitempty"`
	TotalCount      int64  `json:"total_count"`
	TotalPoints     int    `json:"total_points"`
	CompletedCount  int64  `json:"completed_count"`
	CompletedPoints int    `json:"completed_points"`
	Percent         int    `json:"percent"`
	Velocity        int    `json:"velocity,omitempty"`
	CapacityPercent int    `json:"capacity_percent,omitempty"`
}
```

- [ ] **Step 2: Add per-assignee velocity computation in GetCycle**

In `server/internal/handler/cycle.go`, replace the assignee breakdown block (lines 212-229) with:

```go
	if assignees, err := h.Queries.GetCycleAssigneeBreakdown(r.Context(), cycle.ID); err == nil {
		// Fetch per-assignee historical completed points for velocity.
		type velKey struct{ aType, aID string }
		assigneeVelocity := map[velKey]int{}

		if histRows, herr := h.Queries.GetAssigneePointsForCompletedCycles(r.Context(), cycle.TeamID); herr == nil {
			// Count completed cycles to compute average.
			completedCycles, _ := h.Queries.GetLastCompletedCyclesForTeam(r.Context(), cycle.TeamID)
			numCycles := len(completedCycles)
			if numCycles == 0 {
				numCycles = 1
			}
			for _, hr := range histRows {
				key := velKey{hr.AssigneeType.String, uuidToString(hr.AssigneeID)}
				assigneeVelocity[key] = int(math.Round(float64(hr.CompletedPoints) / float64(numCycles)))
			}
		}

		progress.AssigneeBreakdown = make([]BreakdownItem, len(assignees))
		for i, a := range assignees {
			name := ""
			if s, ok := a.AssigneeName.(string); ok {
				name = s
			}
			aID := uuidToString(a.AssigneeID)
			vel := assigneeVelocity[velKey{a.AssigneeType.String, aID}]
			if vel == 0 {
				vel = 10 // sensible default
			}
			capPct := 0
			if vel > 0 {
				capPct = int(math.Round(float64(a.TotalPoints) / float64(vel) * 100))
			}
			progress.AssigneeBreakdown[i] = BreakdownItem{
				ID: aID, ActorType: a.AssigneeType.String, Name: name,
				TotalCount: a.TotalCount, TotalPoints: int(a.TotalPoints),
				CompletedCount: a.CompletedCount, CompletedPoints: int(a.CompletedPoints),
				Percent:         cyclePct(a.CompletedCount, a.TotalCount),
				Velocity:        vel,
				CapacityPercent: capPct,
			}
		}
	}
	if progress.AssigneeBreakdown == nil {
		progress.AssigneeBreakdown = []BreakdownItem{}
	}
```

- [ ] **Step 3: Verify build**

Run:
```bash
cd server && go build ./...
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add server/internal/handler/cycle.go
git commit -m "feat(cycles): compute per-assignee velocity and capacity percent"
```

---

### Task 3: Update TypeScript types

**Files:**
- Modify: `packages/core/types/cycle.ts:15-26`

- [ ] **Step 1: Add velocity and capacity_percent to BreakdownItem**

In `packages/core/types/cycle.ts`, update the `BreakdownItem` interface:

```typescript
export interface BreakdownItem {
  id?: string;
  actor_type?: string;
  name?: string;
  priority?: string;
  icon?: string;
  total_count: number;
  total_points: number;
  completed_count: number;
  completed_points: number;
  percent: number;
  velocity?: number;
  capacity_percent?: number;
}
```

- [ ] **Step 2: Verify typecheck**

Run:
```bash
pnpm typecheck
```

Expected: All packages pass.

- [ ] **Step 3: Commit**

```bash
git add packages/core/types/cycle.ts
git commit -m "feat(cycles): add velocity and capacity_percent to BreakdownItem type"
```

---

### Task 4: Add capacity bar to assignee breakdown rows

**Files:**
- Modify: `packages/views/cycles/components/cycle-breakdown-tabs.tsx`

- [ ] **Step 1: Update the CycleBreakdownTabs component**

Replace the entire contents of `packages/views/cycles/components/cycle-breakdown-tabs.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { cn } from "@multica/ui/lib/utils";
import type { BreakdownItem, LabelBreakdownItem } from "@multica/core/types";
import { LABEL_COLOR_CONFIG } from "@multica/core/labels";

type Tab = "assignees" | "labels" | "priority" | "projects";

const TABS: { value: Tab; label: string }[] = [
  { value: "assignees", label: "Assignees" },
  { value: "labels", label: "Labels" },
  { value: "priority", label: "Priority" },
  { value: "projects", label: "Projects" },
];

const PRIORITY_COLORS: Record<string, string> = {
  urgent: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-400",
  low: "bg-blue-400",
  none: "bg-muted-foreground/40",
};

const PRIORITY_LABELS: Record<string, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

function capacityColor(pct: number) {
  if (pct > 100) return "text-red-400";
  if (pct >= 80) return "text-amber-400";
  return "text-emerald-400";
}

function capacityBarBg(pct: number) {
  if (pct > 100) return "bg-red-400";
  if (pct >= 80) return "bg-amber-400";
  return "bg-emerald-400";
}

function AssigneeRow({ item }: { item: BreakdownItem }) {
  const pct = item.total_count > 0 ? Math.round((item.completed_count / item.total_count) * 100) : 0;
  const vel = item.velocity ?? 0;
  const capPct = item.capacity_percent ?? 0;

  return (
    <div className="py-2 space-y-1">
      {/* Row 1: name + completion */}
      <div className="flex items-center gap-2.5">
        <span className="text-xs truncate min-w-0 flex-1">{item.name || "Unassigned"}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {item.completed_count}/{item.total_count}
        </span>
        <span className="text-[11px] font-medium tabular-nums shrink-0 w-8 text-right">
          {pct}%
        </span>
      </div>
      {/* Row 2: capacity bar */}
      {vel > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-14">
            {item.total_points}/{vel} pts
          </span>
          <div className="h-1.5 flex-1 rounded-full bg-muted/60 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", capacityBarBg(capPct))}
              style={{ width: `${Math.min(capPct, 100)}%` }}
            />
          </div>
          <span className={cn("text-[10px] font-medium tabular-nums shrink-0 w-8 text-right", capacityColor(capPct))}>
            {capPct}%
          </span>
        </div>
      )}
    </div>
  );
}

function BreakdownRow({
  name,
  completed,
  total,
  dotColorClass,
}: {
  name: string;
  completed: number;
  total: number;
  dotColorClass?: string;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      {dotColorClass && <span className={cn("size-2 rounded-full shrink-0", dotColorClass)} />}
      <span className="text-xs truncate min-w-0 flex-1">{name || "Unassigned"}</span>
      <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
        {completed}/{total}
      </span>
      <span className="text-[11px] font-medium tabular-nums shrink-0 w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

function LabelRow({ item }: { item: LabelBreakdownItem }) {
  const cfg = LABEL_COLOR_CONFIG[item.color as keyof typeof LABEL_COLOR_CONFIG];
  return (
    <BreakdownRow
      name={item.name}
      completed={item.completed_count}
      total={item.total_count}
      dotColorClass={cfg?.dot ?? "bg-muted-foreground"}
    />
  );
}

export function CycleBreakdownTabs({
  assigneeBreakdown,
  labelBreakdown,
  priorityBreakdown,
  projectBreakdown,
}: {
  assigneeBreakdown: BreakdownItem[];
  labelBreakdown: LabelBreakdownItem[];
  priorityBreakdown: BreakdownItem[];
  projectBreakdown: BreakdownItem[];
}) {
  const [tab, setTab] = useState<Tab>("assignees");

  return (
    <div>
      <div className="flex gap-0.5 mb-3 p-0.5 rounded-md bg-muted/50">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              "flex-1 text-[11px] px-1.5 py-1 rounded transition-all font-medium",
              tab === t.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-0">
        {tab === "assignees" &&
          (assigneeBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">No assignees</p>
          ) : (
            assigneeBreakdown.map((a) => (
              <AssigneeRow key={a.id || "unassigned"} item={a} />
            ))
          ))}
        {tab === "labels" &&
          (labelBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">No labels</p>
          ) : (
            labelBreakdown.map((l) => <LabelRow key={l.label_id} item={l} />)
          ))}
        {tab === "priority" &&
          (priorityBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">No issues</p>
          ) : (
            priorityBreakdown.map((p) => (
              <BreakdownRow
                key={p.priority || "none"}
                name={PRIORITY_LABELS[p.priority || "none"] || p.priority || ""}
                completed={Number(p.completed_count)}
                total={Number(p.total_count)}
                dotColorClass={PRIORITY_COLORS[p.priority || "none"] || "bg-muted-foreground/40"}
              />
            ))
          ))}
        {tab === "projects" &&
          (projectBreakdown.length === 0 ? (
            <p className="text-xs text-muted-foreground/60 py-4 text-center">No projects</p>
          ) : (
            projectBreakdown.map((p) => (
              <BreakdownRow
                key={p.id || "none"}
                name={p.name || "No project"}
                completed={Number(p.completed_count)}
                total={Number(p.total_count)}
              />
            ))
          ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run:
```bash
pnpm typecheck
```

Expected: All packages pass.

- [ ] **Step 3: Commit**

```bash
git add packages/views/cycles/components/cycle-breakdown-tabs.tsx
git commit -m "feat(cycles): add capacity bar to assignee breakdown rows"
```

---

### Task 5: Add capacity badge to AssigneePicker

**Files:**
- Modify: `packages/views/issues/components/pickers/assignee-picker.tsx`

- [ ] **Step 1: Add capacityMap prop and render capacity badges**

In `packages/views/issues/components/pickers/assignee-picker.tsx`, add the `capacityMap` prop to the function signature. Add it after the `align` prop:

```typescript
export function AssigneePicker({
  assigneeType,
  assigneeId,
  onUpdate,
  trigger: customTrigger,
  triggerRender,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  align,
  capacityMap,
}: {
  assigneeType: IssueAssigneeType | null;
  assigneeId: string | null;
  onUpdate: (updates: Partial<UpdateIssueRequest>) => void;
  trigger?: React.ReactNode;
  triggerRender?: React.ReactElement;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  align?: "start" | "center" | "end";
  capacityMap?: Map<string, number>;
}) {
```

Then update the member `PickerItem` rendering (inside the `filteredMembers.map`) to show the capacity badge. Replace the existing member map block (lines 127-143) with:

```tsx
      {filteredMembers.length > 0 && (
        <PickerSection label="Members">
          {filteredMembers.map((m) => {
            const capPct = capacityMap?.get(m.user_id);
            return (
              <PickerItem
                key={m.user_id}
                selected={isSelected("member", m.user_id)}
                onClick={() => {
                  onUpdate({
                    assignee_type: "member",
                    assignee_id: m.user_id,
                  });
                  setOpen(false);
                }}
              >
                <ActorAvatar actorType="member" actorId={m.user_id} size={18} />
                <span className="flex-1 truncate">{m.name}</span>
                {capPct != null && (
                  <span className={`text-[10px] font-medium tabular-nums ${capPct > 100 ? "text-red-400" : capPct >= 80 ? "text-amber-400" : "text-emerald-400"}`}>
                    {capPct}%
                  </span>
                )}
              </PickerItem>
            );
          })}
        </PickerSection>
      )}
```

- [ ] **Step 2: Verify typecheck**

Run:
```bash
pnpm typecheck
```

Expected: All packages pass.

- [ ] **Step 3: Commit**

```bash
git add packages/views/issues/components/pickers/assignee-picker.tsx
git commit -m "feat(cycles): add capacity badge to assignee picker"
```

---

### Task 6: Wire capacity data to AssigneePicker in issue detail

**Files:**
- Modify: `packages/views/issues/components/issue-detail.tsx`

The `AssigneePicker` is rendered in `issue-detail.tsx` (the panel that opens when you click an issue). The issue has a `cycle_id` field — when present, we query the cycle detail to get assignee breakdown data, build a capacityMap, and pass it to the picker.

- [ ] **Step 1: Add cycle detail query and capacityMap**

In `packages/views/issues/components/issue-detail.tsx`, add the import for `cycleDetailOptions`:

```typescript
import { cycleDetailOptions } from "@multica/core/cycles/queries";
import type { CycleWithProgress } from "@multica/core/types";
```

Inside the `IssueDetail` component, after the existing queries (around line 187, after `const { data: allIssues = [] } = useQuery(issueListOptions(wsId));`), add:

```typescript
  const { data: cycleData } = useQuery({
    ...cycleDetailOptions(wsId, issue?.cycle_id ?? ""),
    enabled: !!issue?.cycle_id,
  });

  const capacityMap = useMemo(() => {
    if (!cycleData) return undefined;
    const c = cycleData as CycleWithProgress;
    if (!c.assignee_breakdown?.length) return undefined;
    const map = new Map<string, number>();
    for (const a of c.assignee_breakdown) {
      if (a.id && a.actor_type === "member") {
        map.set(a.id, a.capacity_percent ?? 0);
      }
    }
    return map.size > 0 ? map : undefined;
  }, [cycleData]);
```

Add `useMemo` to the existing imports from `react` if not already present (it should already be there from other memos in the file).

- [ ] **Step 2: Pass capacityMap to AssigneePicker**

Find the `<AssigneePicker>` usage in issue-detail.tsx (in the Properties section, around line 400-410). Add `capacityMap={capacityMap}` to it:

```tsx
<AssigneePicker
  assigneeType={issue.assignee_type}
  assigneeId={issue.assignee_id}
  onUpdate={handleUpdateField}
  capacityMap={capacityMap}
/>
```

- [ ] **Step 3: Verify typecheck**

Run:
```bash
pnpm typecheck
```

Expected: All packages pass.

- [ ] **Step 4: Commit**

```bash
git add packages/views/issues/components/issue-detail.tsx
git commit -m "feat(cycles): wire capacity data to assignee picker in issue detail"
```

---

### Task 7: Verify end-to-end

- [ ] **Step 1: Run full typecheck**

```bash
pnpm typecheck
```

Expected: All 6 packages pass.

- [ ] **Step 2: Run Go build**

```bash
cd server && go build ./...
```

Expected: Build succeeds.

- [ ] **Step 3: Run Go tests**

```bash
make test
```

Expected: Tests pass.

- [ ] **Step 4: Run frontend tests**

```bash
pnpm test
```

Expected: Tests pass.

- [ ] **Step 5: Manual verification**

Start the app with `make dev` and:

1. Navigate to a cycle detail page with assigned issues that have estimates
2. Open the sidebar — in the Assignees tab, verify each assignee shows:
   - Issue completion row (e.g., "3/12  25%")
   - Capacity row with bar (e.g., "35/25 pts [====] 140%" in red)
3. Click the assignee picker on any issue in the cycle list
4. Verify each member shows a capacity percentage badge (green/amber/red)
5. Assign an issue to someone — after the page refreshes, verify their capacity % increases in both sidebar and picker
6. For a team with no completed cycles, verify the default velocity of 10 is used

