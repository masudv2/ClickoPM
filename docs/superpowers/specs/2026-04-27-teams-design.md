# Teams — Design Spec

## Goal

Introduce Teams as the primary organizational unit within a workspace, mirroring Linear's team model. Issues, projects, and (later) cycles belong to a team. The sidebar is restructured to show team-grouped navigation with collapsible sections.

## Architecture

Teams are workspace-scoped entities. Each team has its own issue namespace (identifier prefix + per-team sequence), its own members (subset of workspace members), and its own settings (timezone, estimates, cycle config). Issues and projects gain a `team_id` foreign key. Existing data migrates to an auto-created "Default" team per workspace.

The sidebar transforms from flat workspace-level navigation to team-grouped navigation, with workspace-level features (Autopilot, Agents, Runtimes, Skills, Settings) remaining in a separate section below.

## Data Model

### `team` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| workspace_id | UUID FK | References workspace(id) ON DELETE CASCADE |
| name | TEXT NOT NULL | Display name (e.g. "Salla", "FoodPanda") |
| identifier | TEXT NOT NULL | Uppercase prefix for issue IDs (e.g. "SAL"). Unique per workspace. |
| icon | TEXT | Emoji or single letter |
| color | TEXT NOT NULL DEFAULT 'blue' | Reuses label color palette (red, orange, amber, yellow, lime, green, teal, blue, indigo, purple, pink, gray) |
| timezone | TEXT NOT NULL DEFAULT 'UTC' | IANA timezone string |
| settings | JSONB NOT NULL DEFAULT '{}' | Team-level config (cycles, estimates, etc.) |
| issue_counter | INTEGER NOT NULL DEFAULT 0 | Auto-incrementing counter for issue numbering within team |
| position | REAL NOT NULL DEFAULT 0 | Ordering in sidebar |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Indexes:**
- UNIQUE on `(workspace_id, lower(identifier))`
- UNIQUE on `(workspace_id, lower(name))`
- INDEX on `workspace_id`

### `team_member` table

| Column | Type | Notes |
|--------|------|-------|
| team_id | UUID FK | References team(id) ON DELETE CASCADE |
| member_id | UUID FK | References member(id) ON DELETE CASCADE |
| created_at | TIMESTAMPTZ NOT NULL DEFAULT now() | |

**Primary key:** (team_id, member_id)

**Indexes:**
- INDEX on `member_id` (look up which teams a member belongs to)

### Changes to `issue` table

- Add `team_id UUID REFERENCES team(id) ON DELETE CASCADE`
- Migration: add as nullable, backfill with default team, set NOT NULL

### Changes to `project` table

- Add `team_id UUID REFERENCES team(id) ON DELETE CASCADE`
- Migration: add as nullable, backfill with default team, set NOT NULL

### Migration strategy

1. Create `team` table and `team_member` table
2. For each existing workspace, create a "Default" team with:
   - `name = 'Default'`
   - `identifier` = first 3 chars of workspace name (uppercased), or 'DEF' fallback
   - `icon = null`
   - `color = 'blue'`
   - `issue_counter` = MAX(issue.number) for that workspace
3. Add `team_id` column to `issue` (nullable)
4. Add `team_id` column to `project` (nullable)
5. Backfill: `UPDATE issue SET team_id = (SELECT id FROM team WHERE workspace_id = issue.workspace_id LIMIT 1)`
6. Same for project
7. Add all existing workspace members to the default team's `team_member` rows
8. Set NOT NULL on `issue.team_id` and `project.team_id`
9. Add indexes on `issue.team_id` and `project.team_id`

### Issue identifier changes

Currently issues use a workspace-level identifier prefix (e.g. "MUL-42"). This changes to per-team:
- Each team has its own `identifier` (e.g. "SAL") and `issue_counter`
- When creating an issue, atomically increment the team's `issue_counter` and use it as the issue number
- Issue `identifier` field stores the full string (e.g. "SAL-42")
- The `number` field on issue stores the per-team sequence number

## Team Settings

Team settings are stored in the `team.settings` JSONB column. Structure:

```json
{
  "estimates": {
    "enabled": false,
    "scale": "fibonacci"
  },
  "cycles": {
    "enabled": false,
    "duration_weeks": 2,
    "cooldown_weeks": 0,
    "start_day": "monday",
    "auto_create_count": 2,
    "auto_add_started": true,
    "auto_add_completed": true
  },
  "slack": {
    "channel_id": null,
    "notifications": {
      "project_update": false,
      "issue_added": false,
      "issue_completed": false,
      "issue_status_changed": false,
      "comments": false,
      "triage": false
    }
  }
}
```

Estimate scales:
- `"not_in_use"` — disabled
- `"fibonacci"` — 0, 1, 2, 3, 5, 8, 13, 21
- `"linear"` — 1, 2, 3, 4, 5, 6, 7, 8, 9, 10
- `"tshirt"` — XS, S, M, L, XL, XXL

## API Endpoints

### Team CRUD

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/teams | List teams in workspace |
| POST | /api/teams | Create team |
| GET | /api/teams/{id} | Get team |
| PUT | /api/teams/{id} | Update team (name, identifier, icon, color, timezone, settings) |
| DELETE | /api/teams/{id} | Delete team |

### Team Members

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/teams/{id}/members | List team members |
| POST | /api/teams/{id}/members | Add member to team |
| DELETE | /api/teams/{id}/members/{memberId} | Remove member from team |

### Changes to existing endpoints

- `GET /api/issues` — add optional `team_id` query param for filtering
- `POST /api/issues` — require `team_id` in request body. Server increments team's `issue_counter` and generates identifier.
- `GET /api/projects` — add optional `team_id` query param
- `POST /api/projects` — require `team_id` in request body

## Sidebar Structure

```
Your teams
  v  Salla           +  ...
     Issues
     Cycles
     Projects         v
       Checkout Redesign     74%
       Payment Gateway       42%
  v  FoodPanda        +  ...
     Issues
     Cycles
     Projects         v
       Rider App v2          58%
  >  BanglaSteel      +  ...

--- (separator)

Inbox
Chat
My Issues
Autopilot
Agents
Runtimes
Skills
Settings
```

### Sidebar behaviors

- **"Your teams" label** — static text, not interactive
- **Team row** — collapsible via arrow toggle. Shows team icon (colored square with letter/emoji) + name
- **`+` button** on team row — creates new issue in that team (opens issue creation with team pre-selected)
- **`...` button** on team row — context menu:
  - Team settings (navigates to `/{slug}/team/{identifier}/settings`)
  - Copy link
  - Leave team
- **Issues** — navigates to `/{slug}/team/{identifier}/issues`
- **Cycles** — navigates to `/{slug}/team/{identifier}/cycles` (placeholder page until Cycles spec)
- **Projects** — collapsible section. Header navigates to `/{slug}/team/{identifier}/projects`. Chevron toggles project list.
  - Each project row shows: colored dot + name + completion % (done_count/issue_count)
  - Clicking a project navigates to `/{slug}/team/{identifier}/projects/{project-id}`
- **Collapsed team** — shows just the team icon + name row, no sub-items

### Sidebar state

- Team collapsed/expanded state stored in Zustand (client state), persisted to localStorage
- Active team derived from current URL path

## Routing

### New routes

| Route | Page |
|-------|------|
| `/{slug}/team/{identifier}/issues` | Team issues list (existing issues page, filtered by team) |
| `/{slug}/team/{identifier}/issues/{id}` | Issue detail (same component) |
| `/{slug}/team/{identifier}/projects` | Team projects list |
| `/{slug}/team/{identifier}/projects/{id}` | Project detail |
| `/{slug}/team/{identifier}/cycles` | Placeholder page ("Cycles coming soon" or empty state) |
| `/{slug}/team/{identifier}/settings` | Team settings (General, Members, Cycles, Slack tabs) |

### Redirects

- `/{slug}/issues` redirects to `/{slug}/team/{default-team-identifier}/issues`
- Same for `/{slug}/projects`

### Workspace-level routes (unchanged)

- `/{slug}/settings` — workspace settings (now includes Teams tab)
- `/{slug}/agents`, `/{slug}/autopilots`, `/{slug}/inbox`, etc. — unchanged

## Team Settings Page

Located at `/{slug}/team/{identifier}/settings`. Tabs:

### General tab
- Icon & Name: icon picker (emoji/letter) + name text input
- Identifier: text input (uppercase, used in issue IDs). Warning if changed: "This will affect new issue IDs."
- Timezone: dropdown with IANA timezones
- Estimates: "Issue estimation" dropdown (Not in use / Fibonacci / Linear / T-shirt)
- Danger zone: Delete team button with confirmation

### Members tab
- Table of current team members with avatar, name, role
- "Add member" button: dropdown of workspace members not yet in this team
- Remove member button per row

### Cycles tab (placeholder)
- Enable cycles toggle
- Cycle duration dropdown (1, 2, 3, 4, 6 weeks)
- Cooldown duration dropdown (0, 1, 2 weeks)
- Cycle start day dropdown (Monday-Sunday)
- Auto-create cycles dropdown (0, 1, 2, 3, 4)
- Cycle automation section:
  - Active issues & due date toggle
  - Completed issues toggle
- All inputs functional and saved to `team.settings` JSONB. Actual cycle logic comes in Cycles spec.

### Slack tab (placeholder UI)
- "Connect a Slack channel" card with disabled "Connect" button
- Notification toggles list (all disabled/grayed):
  - New project update is posted
  - An issue is added to the team
  - An issue is marked completed or canceled
  - An issue changes status
  - Comments to issues
  - An issue is added to the triage queue

## Teams Tab in Workspace Settings

Added to the existing settings page (alongside General, Repositories, Members, Labels):

- Tab: "Teams" with Users icon
- Content: Table listing all teams with columns:
  - Name (icon + name)
  - Identifier
  - Members (count)
  - Issues (count)
  - Created (date)
  - Actions (...) menu: Edit (navigates to team settings), Delete
- "Create team" button: inline form with name, identifier (auto-suggested), icon, color fields

## WebSocket Events

New event types:
- `team:created`, `team:updated`, `team:deleted`
- `team_member:added`, `team_member:removed`

These invalidate the teams query cache on the frontend.

## Out of Scope

- Cycles feature (separate spec, builds on team settings)
- Estimate points on issues (comes with Cycles spec)
- Slack API integration (just placeholder UI in this spec)
- Views feature per team
- Cross-team issue moves
- Team-level permissions/roles (all team members have equal access)
