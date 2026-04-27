# Issue Labels Design Spec

## Overview

Add workspace-level labels that can be assigned to issues. Labels have a name and a preset color. Issues can have multiple labels. Labels are reusable across all issues in a workspace.

## Data Model

### `label` table

| Column       | Type         | Constraints                        |
|-------------|--------------|------------------------------------|
| id          | UUID         | PK, default gen_random_uuid()      |
| workspace_id| UUID         | FK -> workspace(id), NOT NULL      |
| name        | TEXT         | NOT NULL                           |
| color       | TEXT         | NOT NULL                           |
| position    | REAL         | NOT NULL, default 0                |
| created_at  | TIMESTAMPTZ  | NOT NULL, default now()            |
| updated_at  | TIMESTAMPTZ  | NOT NULL, default now()            |

- Unique constraint on (workspace_id, name) -- no duplicate label names per workspace.
- `position` uses REAL for fractional ordering (same pattern as issue reordering).
- `color` stores the preset key (e.g. "red", "blue", "purple") -- not a hex value.

### `issue_label` junction table

| Column   | Type | Constraints                              |
|----------|------|------------------------------------------|
| issue_id | UUID | FK -> issue(id) ON DELETE CASCADE        |
| label_id | UUID | FK -> label(id) ON DELETE CASCADE        |

- PK on (issue_id, label_id).
- Cascade delete: removing a label removes all issue associations; deleting an issue removes its label links.

### Preset Color Palette

12 colors, each with a key, dot color, and badge background/text:

| Key      | Display Name | Dot (Tailwind)       |
|----------|-------------|----------------------|
| red      | Red         | bg-red-500           |
| orange   | Orange      | bg-orange-500        |
| amber    | Amber       | bg-amber-500         |
| yellow   | Yellow      | bg-yellow-500        |
| lime     | Lime        | bg-lime-500          |
| green    | Green       | bg-green-500         |
| teal     | Teal        | bg-teal-500          |
| blue     | Blue        | bg-blue-500          |
| indigo   | Indigo      | bg-indigo-500        |
| purple   | Purple      | bg-purple-500        |
| pink     | Pink        | bg-pink-500          |
| gray     | Gray        | bg-gray-500          |

Badge variants use 100-level bg with 700-level text (e.g. `bg-red-100 text-red-700` in light mode, inverted for dark).

## API Endpoints

All routes under `/api/labels`, protected by `RequireWorkspaceMember` middleware.

### Labels CRUD

| Method | Path                | Handler         | Description                  |
|--------|---------------------|-----------------|------------------------------|
| GET    | /api/labels         | ListLabels      | List all workspace labels    |
| POST   | /api/labels         | CreateLabel     | Create a new label           |
| PUT    | /api/labels/{id}    | UpdateLabel     | Update name, color, position |
| DELETE | /api/labels/{id}    | DeleteLabel     | Delete label + associations  |

### Issue-Label Assignment

| Method | Path                            | Handler            | Description                    |
|--------|---------------------------------|--------------------|--------------------------------|
| GET    | /api/issues/{id}/labels         | ListIssueLabels    | Get labels for an issue        |
| PUT    | /api/issues/{id}/labels         | SetIssueLabels     | Replace all labels on an issue |

`SetIssueLabels` accepts `{ label_ids: string[] }` and replaces the full set (simpler than add/remove individually).

### Query Changes

- `ListIssues` response includes `labels: Label[]` on each issue (joined via issue_label).
- `GetIssue` response includes `labels: Label[]`.
- Filter parameter: `label_id` on `ListIssues` to filter by label.

## Frontend

### Types (`packages/core/types/label.ts`)

```typescript
export interface Label {
  id: string;
  workspace_id: string;
  name: string;
  color: LabelColor;
  position: number;
  created_at: string;
  updated_at: string;
}

export type LabelColor =
  | "red" | "orange" | "amber" | "yellow" | "lime" | "green"
  | "teal" | "blue" | "indigo" | "purple" | "pink" | "gray";

export interface CreateLabelRequest {
  name: string;
  color: LabelColor;
}

export interface UpdateLabelRequest {
  name?: string;
  color?: LabelColor;
  position?: number;
}
```

### Config (`packages/core/labels/config.ts`)

Label color config map: key -> { label, dotColor, badgeBg, badgeText, darkBadgeBg, darkBadgeText }.

### Query Keys & Options (`packages/core/labels/queries.ts`)

```typescript
export const labelKeys = {
  all: (wsId: string) => ["labels", wsId] as const,
  list: (wsId: string) => [...labelKeys.all(wsId), "list"] as const,
};
```

### Mutations (`packages/core/labels/mutations.ts`)

- `useCreateLabel` -- optimistic insert into list cache
- `useUpdateLabel` -- optimistic update in list cache
- `useDeleteLabel` -- optimistic remove from list cache
- `useSetIssueLabels` -- optimistic update on issue detail + list caches

### API Client (`packages/core/api/client.ts`)

Add methods:
- `listLabels(): Promise<{ labels: Label[] }>`
- `createLabel(data: CreateLabelRequest): Promise<Label>`
- `updateLabel(id: string, data: UpdateLabelRequest): Promise<Label>`
- `deleteLabel(id: string): Promise<void>`
- `listIssueLabels(issueId: string): Promise<{ labels: Label[] }>`
- `setIssueLabels(issueId: string, labelIds: string[]): Promise<void>`

### UI Components

#### Label Pill (`packages/views/labels/components/label-pill.tsx`)

Small colored badge showing label name. Used inline on issue rows.

```
[  Bug  ] [  Frontend  ]
```

Renders as: colored dot + name text, or full badge with colored background.

#### Label Picker (`packages/views/labels/components/label-picker.tsx`)

Multi-select Popover with:
- Search/filter input
- Checkbox list of workspace labels (colored dot + name)
- "Create label" inline action at bottom
- Triggers `useSetIssueLabels` on change

#### Labels Management Page (`packages/views/labels/components/labels-settings.tsx`)

Accessed from workspace settings. Shows:
- List of all labels with color dot, name, edit/delete actions
- Drag-to-reorder via dnd-kit (updates position)
- Inline edit: click name to edit, click color dot to change color
- "New label" button at top
- Delete with confirmation dialog

### Integration Points

#### Issue List/Board Views

- Label pills rendered after issue title in list rows
- Label pills rendered on board cards
- Filter bar includes label multi-select filter

#### Issue Detail Sidebar

- "Labels" section in the sidebar (below Status, Priority, Assignee)
- Shows assigned label pills
- Click to open label picker popover

#### Sidebar Navigation

No new nav item needed -- labels management lives in workspace Settings.

## WebSocket Events

| Event              | Payload        | Trigger           |
|--------------------|----------------|-------------------|
| label.created      | Label          | CreateLabel       |
| label.updated      | Label          | UpdateLabel       |
| label.deleted      | { id: string } | DeleteLabel       |

Events invalidate `labelKeys.list(wsId)` query cache.

## Paths

Add to `packages/core/paths/paths.ts`:
- No new routes needed -- labels management is a settings sub-page, issue labels are inline on existing views.

## Migration Number

Next available migration number: `059_labels`

## Testing

- **Go handler tests**: CRUD operations, duplicate name validation, cascade delete, set issue labels
- **TypeScript tests**: Label mutations with optimistic updates, label picker component rendering
- **E2E**: Create label, assign to issue, verify display, filter by label
