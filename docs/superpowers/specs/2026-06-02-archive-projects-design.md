# Archive Projects Design Spec

## Overview

Add the ability to archive projects per team via a hover action in the left sidebar. Archived projects disappear from the active list and appear in a collapsible "Archived (N)" section at the bottom of each team's project list. Users can unarchive from the same section.

## Backend Status

The backend is fully implemented — no changes needed:

- `POST /api/projects/{id}/archive` — sets `archived_at = now()`
- `POST /api/projects/{id}/unarchive` — sets `archived_at = NULL`
- `GET /api/projects?include_archived=true` — returns both active and archived
- Both endpoints protected by `adminOnly` middleware
- DB column `archived_at TIMESTAMPTZ` exists (migration 068)

## Data Layer Changes (Frontend)

### `packages/core/types/project.ts`
Add `archived_at: string | null` to the `Project` interface.

### `packages/core/api/client.ts`
- Add `archiveProject(id: string): Promise<Project>` → `POST /api/projects/{id}/archive`
- Add `unarchiveProject(id: string): Promise<Project>` → `POST /api/projects/{id}/unarchive`
- Update `listProjects` signature to accept `include_archived?: boolean` and pass it as a query param

### `packages/core/projects/queries.ts`
Update `projectListOptions` to pass `include_archived: true`. Active vs. archived splitting is done client-side in the component, keeping the cache as a single source of truth.

### `packages/core/projects/mutations.ts`
Add two mutations following the same optimistic-update pattern as `useUpdateProject`:

**`useArchiveProject`**
- Optimistic: set `archived_at` to current ISO timestamp in the cached project list
- On error: roll back to previous list
- On settle: invalidate `projectKeys.list(wsId)`

**`useUnarchiveProject`**
- Optimistic: set `archived_at` to `null` in the cached project list
- On error: roll back to previous list
- On settle: invalidate `projectKeys.list(wsId)`

## Sidebar UI Changes

### `packages/views/teams/components/team-sidebar-section.tsx`

#### `SortableProjectItem`
- Add `group` class to the outer wrapper div
- Add a hover-reveal `MoreHorizontal` button: `opacity-0 group-hover:opacity-100` (same pattern as `TeamContextMenu`)
- Button opens a Popover with one action: "Archive project" (calls `useArchiveProject`)
- Button uses `e.stopPropagation()` to avoid triggering drag
- Accepts an optional `isArchived` prop; when true, shows "Unarchive" instead of "Archive" and renders with muted styling (`opacity-60`), no drag handles

#### `TeamProjectsList`
Split the project list into two arrays from the same query cache:

```ts
const activeProjects = teamProjects.filter(p => p.archived_at === null)
const archivedProjects = teamProjects.filter(p => p.archived_at !== null)
```

- Active projects render exactly as today with drag-and-drop reorder
- "No projects" empty state only shows when `activeProjects.length === 0 && archivedProjects.length === 0`
- If `archivedProjects.length > 0`, render a toggle row below the active list:
  - Label: `Archived (N)` with a `ChevronRight` that rotates on expand
  - Collapsed by default (`useState(false)`)
  - When expanded, renders archived projects using `SortableProjectItem` with `isArchived={true}` and no `DndContext` wrapper

## UX Behaviour

- Archive action is only shown to admins (backend enforces this; frontend does not need to gate the button since the API will 403 for non-admins)
- Archived section is collapsed by default; state is local (not persisted)
- Dragging is disabled for archived projects
- Archived project links still navigate to the project detail page
