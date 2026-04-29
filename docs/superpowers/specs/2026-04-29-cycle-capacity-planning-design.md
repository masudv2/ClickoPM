# Cycle Capacity Planning — Design Spec

## Goal

Show per-assignee capacity utilization directly on the cycle detail page so that leads can see who has room and who is overloaded while assigning work — without switching to the workload page.

## Context

The team is migrating from ClickUp (hours-based estimation) to Multica (fibonacci points). The main concern is capacity planning: "can this person handle more work this sprint?" Currently the workload page answers this, but it requires navigating away from the cycle page where assignment happens. This feature brings capacity information to the point of decision.

## Design

### Part 1: Capacity indicators in cycle sidebar assignee breakdown

The cycle sidebar already shows an "Assignees" tab in the breakdown section with `name | completed/total | %` per assignee. We enhance each assignee row with a capacity indicator.

**Current row:**
```
Masud Vali        3/12    25%
```

**New row:**
```
Masud Vali        3/12    25%
                  35/25 pts  [========] 140%  (red)
```

The first line stays as-is (issue completion progress). Below it, a second line shows:

- `assigned_points / capacity` — how many points assigned vs their velocity-derived capacity
- A thin capacity bar with color coding
- Capacity percentage

**Color coding:**
- Green: < 80%
- Amber: 80-100%
- Red: > 100%

**Capacity calculation:** Same as workload page — velocity is the average `completed_points` from the last 3 completed cycles for the same team. Default to 10 if no history.

**Data source:** The `CycleWithProgress` response already contains:
- `assignee_breakdown[].total_points` — sum of estimates for this assignee in the cycle
- `velocity` — team-level velocity (already computed by backend)

What's missing: per-assignee velocity. Currently `velocity` is team-level. We need per-assignee velocity from the backend to make capacity per-person accurate.

### Backend change: Add per-assignee velocity to breakdown

Extend `BreakdownItem` with two new fields:

```go
type BreakdownAssignee struct {
    // existing fields...
    Velocity        int `json:"velocity"`
    CapacityPercent int `json:"capacity_percent"`
}
```

In the `GetCycle` handler, after computing the assignee breakdown, for each assignee:
1. Call `GetLastCompletedCyclesForTeam` (already exists)
2. For each completed cycle, sum that assignee's completed points (filter breakdown by assignee_id)
3. Average across cycles = per-assignee velocity
4. `capacity_percent = (total_points / velocity) * 100`

This reuses the same velocity logic as the workload handler.

### TypeScript type change

```typescript
// In BreakdownItem — add optional fields (only populated for assignee breakdown)
export interface BreakdownItem {
  // ...existing fields
  velocity?: number;
  capacity_percent?: number;
}
```

### Part 2: Capacity hint in assignee picker

When the `AssigneePicker` is used within a cycle context, show a small capacity indicator next to each member name.

**Current picker row:**
```
[avatar] Masud Vali
```

**Enhanced picker row (cycle context only):**
```
[avatar] Masud Vali          140% (red dot)
```

**Implementation:**
- Add optional `capacityMap` prop to `AssigneePicker`: `Map<string, { percent: number }>`
- When provided, render a small colored percentage badge next to each member name
- The cycle detail page computes this map from `cycle.assignee_breakdown` and passes it down
- Outside cycle context (e.g., issue detail, board card), `capacityMap` is not passed and picker renders as before

### Estimate scale awareness

The breakdown rows and picker should use the team's estimate scale for labels. The `formatEstimateShort` and `estimateUnit` utilities (already created in `packages/core/issues/config/estimate.ts`) handle this. The cycle detail page already has access to team settings.

## Files to modify

1. **`packages/core/types/cycle.ts`** — Add `velocity` and `capacity_percent` to `BreakdownItem`
2. **`server/internal/handler/cycle.go`** — Compute per-assignee velocity and capacity_percent in GetCycle
3. **`packages/views/cycles/components/cycle-breakdown-tabs.tsx`** — Add capacity bar to assignee rows
4. **`packages/views/issues/components/pickers/assignee-picker.tsx`** — Add optional `capacityMap` prop, render capacity badge
5. **`packages/views/cycles/components/cycle-detail-page.tsx`** — Build capacityMap from cycle data, pass to components

## What we are NOT building

- No time tracking or actual-hours logging
- No separate "planning mode" page — capacity info is integrated into existing views
- No changes to the workload page — it already works and serves a different purpose (cross-team overview)
- No new API endpoints — we extend the existing cycle detail response

## Verification

- Open a cycle detail page with assigned issues that have estimates
- Verify assignee breakdown shows capacity bars with correct percentages
- Verify color coding: green < 80%, amber 80-100%, red > 100%
- Assign an issue to someone via the picker — verify capacity % appears next to names
- Verify the capacity updates after assignment (TanStack Query invalidation)
- Teams with no completed cycles should show default velocity of 10
