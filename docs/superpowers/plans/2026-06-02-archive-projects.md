# Archive Projects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add archive/unarchive for projects via a hover `...` button on each project row in the sidebar, with a collapsible "Archived (N)" section per team.

**Architecture:** Backend is already complete (endpoints, DB column, query param). All work is frontend-only: add `archived_at` to the TS type, wire up the API client and mutations, extract a testable split helper, then update the sidebar component.

**Tech Stack:** TypeScript, TanStack Query, React, Tailwind, lucide-react, `@dnd-kit`

---

## File Map

| File | Change |
|---|---|
| `packages/core/types/project.ts` | Add `archived_at: string \| null` to `Project` interface |
| `packages/core/api/client.ts` | Add `archiveProject`, `unarchiveProject`; extend `listProjects` params |
| `packages/core/projects/queries.ts` | Pass `include_archived: true` in `projectListOptions` |
| `packages/core/projects/utils.ts` | **Create** — pure `splitProjectsByArchiveStatus` helper |
| `packages/core/projects/utils.test.ts` | **Create** — unit tests for the split helper |
| `packages/core/projects/mutations.ts` | Add `useArchiveProject`, `useUnarchiveProject` |
| `packages/views/teams/components/team-sidebar-section.tsx` | Add hover menu + archived section |

---

## Task 1: Add `archived_at` to Project type

**Files:**
- Modify: `packages/core/types/project.ts`

- [ ] **Open `packages/core/types/project.ts`**. The `Project` interface currently ends at `done_count: number;`. Add `archived_at` after `updated_at`:

```ts
export interface Project {
  id: string;
  workspace_id: string;
  team_id: string;
  title: string;
  description: string | null;
  icon: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  lead_type: "member" | "agent" | null;
  lead_id: string | null;
  start_date: string | null;
  target_date: string | null;
  position: number;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  issue_count: number;
  done_count: number;
}
```

- [ ] **Commit**

```bash
git add packages/core/types/project.ts
git commit -m "feat(projects): add archived_at to Project type"
```

---

## Task 2: Update API client

**Files:**
- Modify: `packages/core/api/client.ts`

- [ ] **Find `listProjects`** (around line 1014). Replace the method with:

```ts
async listProjects(params?: {
  status?: string;
  team_id?: string;
  include_archived?: boolean;
}): Promise<ListProjectsResponse> {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.team_id) search.set("team_id", params.team_id);
  if (params?.include_archived) search.set("include_archived", "true");
  return this.fetch(`/api/projects?${search}`);
}
```

- [ ] **Add `archiveProject` and `unarchiveProject`** directly after `deleteProject`:

```ts
async archiveProject(id: string): Promise<Project> {
  return this.fetch(`/api/projects/${id}/archive`, { method: "POST" });
}

async unarchiveProject(id: string): Promise<Project> {
  return this.fetch(`/api/projects/${id}/unarchive`, { method: "POST" });
}
```

- [ ] **Commit**

```bash
git add packages/core/api/client.ts
git commit -m "feat(projects): add archiveProject/unarchiveProject to API client"
```

---

## Task 3: Update query to include archived projects

**Files:**
- Modify: `packages/core/projects/queries.ts`

- [ ] **Open `packages/core/projects/queries.ts`**. Replace `projectListOptions`:

```ts
export function projectListOptions(wsId: string, teamId?: string) {
  return queryOptions({
    queryKey: teamId ? [...projectKeys.list(wsId), "team", teamId] : projectKeys.list(wsId),
    queryFn: () =>
      api.listProjects(
        teamId
          ? { team_id: teamId, include_archived: true }
          : { include_archived: true },
      ),
    select: (data) => data.projects,
  });
}
```

- [ ] **Commit**

```bash
git add packages/core/projects/queries.ts
git commit -m "feat(projects): fetch archived projects in projectListOptions"
```

---

## Task 4: Create split helper and write tests (TDD)

**Files:**
- Create: `packages/core/projects/utils.ts`
- Create: `packages/core/projects/utils.test.ts`

- [ ] **Write the failing test first.** Create `packages/core/projects/utils.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { splitProjectsByArchiveStatus } from "./utils";
import type { Project } from "../types";

function makeProject(id: string, archived_at: string | null = null): Project {
  return {
    id,
    workspace_id: "ws-1",
    team_id: "team-1",
    title: `Project ${id}`,
    description: null,
    icon: null,
    status: "planned",
    priority: "none",
    lead_type: null,
    lead_id: null,
    start_date: null,
    target_date: null,
    position: 1,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    archived_at,
    issue_count: 0,
    done_count: 0,
  };
}

describe("splitProjectsByArchiveStatus", () => {
  it("puts projects with archived_at=null into active", () => {
    const { active, archived } = splitProjectsByArchiveStatus([
      makeProject("a"),
      makeProject("b"),
    ]);
    expect(active.map((p) => p.id)).toEqual(["a", "b"]);
    expect(archived).toHaveLength(0);
  });

  it("puts projects with a non-null archived_at into archived", () => {
    const { active, archived } = splitProjectsByArchiveStatus([
      makeProject("a", "2026-01-01T00:00:00Z"),
      makeProject("b", "2026-01-02T00:00:00Z"),
    ]);
    expect(active).toHaveLength(0);
    expect(archived.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("splits mixed lists correctly", () => {
    const { active, archived } = splitProjectsByArchiveStatus([
      makeProject("active-1"),
      makeProject("archived-1", "2026-01-01T00:00:00Z"),
      makeProject("active-2"),
    ]);
    expect(active.map((p) => p.id)).toEqual(["active-1", "active-2"]);
    expect(archived.map((p) => p.id)).toEqual(["archived-1"]);
  });

  it("returns empty arrays for an empty input", () => {
    const { active, archived } = splitProjectsByArchiveStatus([]);
    expect(active).toHaveLength(0);
    expect(archived).toHaveLength(0);
  });
});
```

- [ ] **Run to confirm it fails**

```bash
cd /path/to/repo && pnpm --filter @multica/core exec vitest run projects/utils.test.ts
```

Expected: `Error: Failed to resolve import "./utils"`

- [ ] **Create `packages/core/projects/utils.ts`**:

```ts
import type { Project } from "../types";

export function splitProjectsByArchiveStatus(projects: Project[]) {
  return {
    active: projects.filter((p) => p.archived_at === null),
    archived: projects.filter((p) => p.archived_at !== null),
  };
}
```

- [ ] **Run tests to confirm they pass**

```bash
pnpm --filter @multica/core exec vitest run projects/utils.test.ts
```

Expected: `4 tests passed`

- [ ] **Commit**

```bash
git add packages/core/projects/utils.ts packages/core/projects/utils.test.ts
git commit -m "feat(projects): add splitProjectsByArchiveStatus helper"
```

---

## Task 5: Add archive/unarchive mutations

**Files:**
- Modify: `packages/core/projects/mutations.ts`

- [ ] **Open `packages/core/projects/mutations.ts`**. Add these two mutations at the end of the file (after `useDeleteProject`):

```ts
export function useArchiveProject() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.archiveProject(id),
    onMutate: (id) => {
      const prevList = qc.getQueryData<ListProjectsResponse>(projectKeys.list(wsId));
      qc.setQueryData<ListProjectsResponse>(projectKeys.list(wsId), (old) =>
        old
          ? {
              ...old,
              projects: old.projects.map((p) =>
                p.id === id ? { ...p, archived_at: new Date().toISOString() } : p,
              ),
            }
          : old,
      );
      return { prevList };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevList) qc.setQueryData(projectKeys.list(wsId), ctx.prevList);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list(wsId) });
    },
  });
}

export function useUnarchiveProject() {
  const qc = useQueryClient();
  const wsId = useWorkspaceId();
  return useMutation({
    mutationFn: (id: string) => api.unarchiveProject(id),
    onMutate: (id) => {
      const prevList = qc.getQueryData<ListProjectsResponse>(projectKeys.list(wsId));
      qc.setQueryData<ListProjectsResponse>(projectKeys.list(wsId), (old) =>
        old
          ? {
              ...old,
              projects: old.projects.map((p) =>
                p.id === id ? { ...p, archived_at: null } : p,
              ),
            }
          : old,
      );
      return { prevList };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevList) qc.setQueryData(projectKeys.list(wsId), ctx.prevList);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list(wsId) });
    },
  });
}
```

- [ ] **Run typecheck**

```bash
pnpm --filter @multica/core typecheck
```

Expected: no errors

- [ ] **Commit**

```bash
git add packages/core/projects/mutations.ts
git commit -m "feat(projects): add useArchiveProject and useUnarchiveProject mutations"
```

---

## Task 6: Update sidebar component

**Files:**
- Modify: `packages/views/teams/components/team-sidebar-section.tsx`

- [ ] **Update imports** at the top of `team-sidebar-section.tsx`. Add `Archive`, `ArchiveRestore` to the lucide-react import, add `useState` to the react import (it's already imported — just add to the list), and add the new mutations import:

```ts
// Replace the existing lucide-react import line with:
import { ChevronRight, Plus, MoreHorizontal, Settings, Link2, LogOut, ListTodo, Timer, FolderKanban, FolderPlus, Briefcase, Archive, ArchiveRestore } from "lucide-react";

// Replace the existing mutations import line with:
import { useReorderProjects, useArchiveProject, useUnarchiveProject } from "@multica/core/projects/mutations";
```

- [ ] **Replace the entire `SortableProjectItem` function** with this version that adds the hover menu and `isArchived` prop:

```tsx
function SortableProjectItem({
  project,
  teamIdentifier,
  isArchived = false,
}: {
  project: Project;
  teamIdentifier: string;
  isArchived?: boolean;
}) {
  const p = useWorkspacePaths();
  const [menuOpen, setMenuOpen] = useState(false);
  const archiveProject = useArchiveProject();
  const unarchiveProject = useUnarchiveProject();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
    disabled: isArchived,
  });
  const wasDragged = useRef(false);

  useEffect(() => {
    if (isDragging) wasDragged.current = true;
  }, [isDragging]);

  const total = project.issue_count || 0;
  const done = project.done_count || 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("group/project flex items-center gap-1 pr-1", isDragging && "opacity-30")}
      {...(isArchived ? {} : attributes)}
      {...(isArchived ? {} : listeners)}
    >
      <AppLink
        href={p.teamProjectDetail(teamIdentifier, project.id)}
        draggable={false}
        onClick={(e) => {
          if (wasDragged.current) {
            wasDragged.current = false;
            e.preventDefault();
          }
        }}
        className={cn(
          "flex flex-1 items-center gap-2 rounded-md px-2 py-1 pl-10 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
          isDragging && "pointer-events-none",
          isArchived && "opacity-60",
        )}
      >
        <Briefcase className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{project.title}</span>
        <span className="text-xs tabular-nums">{pct}%</span>
      </AppLink>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger
          className="opacity-0 group-hover/project:opacity-100 shrink-0 rounded p-0.5 hover:bg-accent transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent className="w-40 p-1" align="end">
          {isArchived ? (
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                unarchiveProject.mutate(project.id);
                setMenuOpen(false);
              }}
            >
              <ArchiveRestore className="size-4" /> Unarchive
            </button>
          ) : (
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors"
              onClick={() => {
                archiveProject.mutate(project.id);
                setMenuOpen(false);
              }}
            >
              <Archive className="size-4" /> Archive
            </button>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

- [ ] **Replace the entire `TeamProjectsList` function** with this version that splits active/archived and renders the collapsed archived section:

```tsx
function TeamProjectsList({ teamId, teamIdentifier }: { teamId: string; teamIdentifier: string }) {
  const wsId = useWorkspaceId();
  const { data: allProjects = [] } = useQuery(projectListOptions(wsId));
  const teamProjects = allProjects.filter((proj) => proj.team_id === teamId);
  const activeProjects = teamProjects.filter((p) => p.archived_at === null);
  const archivedProjects = teamProjects.filter((p) => p.archived_at !== null);
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const reorderProjects = useReorderProjects();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (teamProjects.length === 0) {
    return <p className="pl-10 text-xs text-muted-foreground py-1">No projects</p>;
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeProjects.findIndex((p) => p.id === active.id);
    const newIndex = activeProjects.findIndex((p) => p.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(activeProjects, oldIndex, newIndex);
    const slots = activeProjects.map((p) => p.position).sort((a, b) => a - b);
    const ids = reordered.map((p) => p.id);
    const positions = reordered.map((_, i) => slots[i] ?? i + 1);
    reorderProjects.mutate({ ids, positions });
  };

  return (
    <div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={activeProjects.map((p) => p.id)}
          strategy={verticalListSortingStrategy}
        >
          {activeProjects.map((proj) => (
            <SortableProjectItem key={proj.id} project={proj} teamIdentifier={teamIdentifier} />
          ))}
        </SortableContext>
      </DndContext>
      {archivedProjects.length > 0 && (
        <div>
          <button
            onClick={() => setArchivedExpanded(!archivedExpanded)}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 pl-10 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ChevronRight
              className={cn("size-3 transition-transform", archivedExpanded && "rotate-90")}
            />
            <span>Archived ({archivedProjects.length})</span>
          </button>
          {archivedExpanded &&
            archivedProjects.map((proj) => (
              <SortableProjectItem
                key={proj.id}
                project={proj}
                teamIdentifier={teamIdentifier}
                isArchived
              />
            ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Run typecheck**

```bash
pnpm --filter @multica/views typecheck
```

Expected: no errors

- [ ] **Commit**

```bash
git add packages/views/teams/components/team-sidebar-section.tsx
git commit -m "feat(projects): archive/unarchive projects in sidebar"
```

---

## Task 7: Verify in the running app

- [ ] **Open http://localhost:3000** (the dev server started with `make dev` should still be running; if not, run `make dev` from the repo root)

- [ ] **Create a project** under any team via the team context menu (`...` → Create project)

- [ ] **Hover over the project row** in the sidebar — confirm the `...` button appears

- [ ] **Click `...` → Archive** — confirm the project disappears from the active list and an "Archived (1)" toggle appears below

- [ ] **Click "Archived (1)"** — confirm the section expands and shows the archived project (muted style)

- [ ] **Click `...` → Unarchive** on the archived project — confirm it moves back to the active list and the "Archived" toggle disappears

- [ ] **Run full typecheck and unit tests**

```bash
pnpm typecheck && pnpm test
```

Expected: all pass
