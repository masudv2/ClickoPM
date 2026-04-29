# Ticketing System Design

## Goal

Add a client-facing ticketing system to Multica. Clients submit tickets through a lightweight portal, the internal team triages and resolves them, and SLA policies enforce response/resolution targets. Tickets can be linked to issues when dev work is needed.

## Architecture

Tickets are a first-class entity separate from issues. Clients are workspace members with a "client" role, scoped to specific projects. SLA policies are workspace-level configurations assigned per client. The client portal is a minimal, separate route group that shares the same auth flow.

**Tech stack:** Same as existing — Go backend (Chi, sqlc), Next.js frontend, shared packages (core/views/ui), Resend for email, Slack for alerts.

---

## 1. Data Model

### `sla_policy` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| workspace_id | UUID FK | |
| name | text | e.g. "Premium", "Standard" |
| critical_first_response | int (minutes) | nullable = no SLA |
| critical_update_interval | int (minutes) | |
| critical_resolution | int (minutes) | |
| high_first_response | int (minutes) | |
| high_update_interval | int (minutes) | |
| high_resolution | int (minutes) | |
| normal_first_response | int (minutes) | |
| normal_update_interval | int (minutes) | |
| normal_resolution | int (minutes) | |
| low_first_response | int (minutes) | |
| low_update_interval | int (minutes) | |
| low_resolution | int (minutes) | |
| support_hours | text | e.g. "9-17" or "24/7" |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `client` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| workspace_id | UUID FK | |
| user_id | UUID FK | FK to user table |
| sla_policy_id | UUID FK | FK to sla_policy |
| company_name | text | optional, for display |
| created_at | timestamptz | |
| updated_at | timestamptz | |
| UNIQUE | (workspace_id, user_id) | |

### `client_project` table (many-to-many)

| Column | Type | Notes |
|--------|------|-------|
| client_id | UUID FK | |
| project_id | UUID FK | |
| UNIQUE | (client_id, project_id) | |

### `ticket` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| workspace_id | UUID FK | |
| project_id | UUID FK | |
| client_id | UUID FK | |
| number | int | auto-increment per workspace |
| subject | text | |
| description | text | |
| type | text | bug, change_request, support, clarification |
| priority | text | critical, high, normal, low |
| client_status | text | open, in_progress, waiting_on_you, resolved, closed |
| internal_status | text | new, triage, assigned, in_progress, waiting_on_client, waiting_on_internal, resolved, closed |
| assignee_type | text | member or agent (nullable) |
| assignee_id | UUID | nullable |
| linked_issue_id | UUID FK | nullable, FK to issue |
| pending_reply | boolean | default false |
| source | text | portal, email, manual |
| first_response_at | timestamptz | null until first team reply |
| first_response_due | timestamptz | computed from SLA on creation |
| next_update_due | timestamptz | recomputed after each reply |
| resolution_due | timestamptz | computed from SLA on creation |
| resolved_at | timestamptz | |
| closed_at | timestamptz | |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### `ticket_message` table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| ticket_id | UUID FK | |
| type | text | reply or note |
| body | text | |
| sender_type | text | member, client, agent |
| sender_id | UUID | |
| created_at | timestamptz | |

### Attachment changes

Add nullable columns to existing `attachment` table:
- `ticket_id` UUID FK (nullable)
- `ticket_message_id` UUID FK (nullable)

---

## 2. Member Role Extension

Add "client" to the member role enum. The existing member table gains a new valid role value.

**Client invitation flow:**
1. Admin goes to Workspace Settings > Members
2. Clicks "Invite Client" — enters email, selects projects, picks SLA policy
3. System creates: client record + member record (role=client) + sends invitation email
4. Client clicks link, verifies email code, lands in portal

**Access control:**
- Clients cannot see: issues, cycles, workload, dashboard, agents, settings, other teams
- Clients can see: their own tickets, their project list, reply thread (no internal notes)
- Existing `RequireWorkspaceMember` middleware allows clients through (they are members)
- New `RequireInternalMember` middleware blocks clients from internal routes
- New `RequireClient` middleware for portal routes

---

## 3. API Routes

### Portal API (client-accessible)

```
GET    /api/portal/tickets              — list my tickets
POST   /api/portal/tickets              — create ticket
GET    /api/portal/tickets/:id          — get ticket detail
POST   /api/portal/tickets/:id/reply    — add reply
PATCH  /api/portal/tickets/:id/resolve  — mark resolved
PATCH  /api/portal/tickets/:id/reopen   — request reopen
GET    /api/portal/projects             — list my projects
POST   /api/portal/upload               — upload attachment
```

### Internal API (team-only)

```
GET    /api/tickets                     — list all tickets (filterable)
GET    /api/tickets/:id                 — get ticket detail (includes notes)
PATCH  /api/tickets/:id                 — update ticket (status, assignee, priority, type)
POST   /api/tickets/:id/reply           — add reply (sends email to client)
POST   /api/tickets/:id/note            — add internal note
POST   /api/tickets/:id/link-issue      — link existing issue
POST   /api/tickets/:id/create-issue    — create issue from ticket
DELETE /api/tickets/:id                 — delete ticket

GET    /api/tickets/sla-monitor         — SLA monitor data (breached, at risk, etc.)

CRUD   /api/sla-policies                — manage SLA policies
CRUD   /api/clients                     — manage clients (list, create, update, delete)
GET    /api/clients/:id/projects        — list client's projects
POST   /api/clients/:id/projects        — add project to client
DELETE /api/clients/:id/projects/:pid   — remove project from client
```

---

## 4. Internal Ticket Views

### Sidebar

New "Tickets" section in sidebar:
- All Tickets
- SLA Monitor

### Ticket list view

Table layout matching existing issues list style. Columns:
- ID (TKT-1)
- Subject
- Client (company name or user name)
- Project
- Priority (badge)
- Status (internal status badge)
- Assignee (avatar)
- SLA due (color-coded: green/amber/red)
- Last updated

Filterable by: status, priority, project, assignee, SLA status (on track / at risk / breached).

### Ticket detail page

Same layout as issue detail:
- **Left panel:** Two tabs — "Replies" and "Notes"
  - Replies tab: chronological thread of public replies (both team and client messages)
  - Notes tab: internal-only notes for team discussion
  - Reply/note input box at bottom of each tab
- **Right sidebar:** Metadata
  - Client name + company
  - Project
  - Type
  - Priority
  - Internal status (editable)
  - Client status (auto-derived from internal status)
  - Assignee (picker)
  - SLA info (first response due, resolution due, current status)
  - Linked issue (with "Create Issue" / "Link Issue" buttons)
  - Pending reply flag
  - Created at, updated at
  - Attachments list

### SLA Monitor view

Priority-sorted dashboard:
- Breached first response (red)
- Breached resolution (red)
- At risk — <25% time remaining (amber)
- Waiting on client
- Critical open tickets

---

## 5. Client Portal UI

### Layout

Minimal chrome — workspace logo, "Support Portal" header, user menu (logout). No sidebar. Clean single-page feel.

### Portal dashboard

Three sections: Open Tickets, Waiting on Me, Recently Resolved.

Each ticket card shows: ID, subject, project, priority badge, status badge, last updated, SLA target.

"Create New Ticket" button prominent at top.

### Create ticket form

Fields:
- Project (dropdown — only assigned projects)
- Subject
- Type (Bug, Change Request, Support, Clarification)
- Priority (Critical, High, Normal, Low)
- Description (rich text)
- Attachments (drag & drop + upload button)

### Ticket detail (client view)

- Reply thread only (no notes tab)
- Status badge + SLA target displayed
- Reply box at bottom with attachment support
- "Mark Resolved" button
- "Reopen" button on resolved tickets

---

## 6. Automations & Notifications

### Auto-actions on ticket creation

- Compute SLA deadlines from client's SLA policy + ticket priority
- Set internal_status = "new", client_status = "open"
- Critical priority → auto-add to team's active cycle + Slack alert

### Status sync (ticket ↔ linked issue)

- Linked issue moves to "done" → ticket internal_status = "resolved", client_status = "resolved", pending_reply = true
- Team writes a reply on a pending_reply ticket → pending_reply = false, email sent to client
- One-way sync only: issue → ticket. Closing a ticket does NOT close the issue.

### Client status derivation

| Internal Status | Client Status |
|----------------|---------------|
| new | open |
| triage | open |
| assigned | open |
| in_progress | in_progress |
| waiting_on_client | waiting_on_you |
| waiting_on_internal | in_progress |
| resolved | resolved |
| closed | closed |

### Email notifications (via Resend)

- New ticket created → email to team (assignee or workspace admins)
- New reply from team → email to client
- New reply from client → email to assigned team member
- Ticket resolved with reply → email to client

### Slack notifications

- Critical ticket created → Slack alert to team channel
- SLA breach → Slack warning to team channel

### SLA tracking

- First response timer: starts on creation, stops when team sends first reply
- Update timer: resets after each team reply
- Resolution timer: starts on creation, stops on resolved
- Cron job: checks for SLA breaches every 5 minutes, flags overdue tickets

---

## 7. Implementation Phases

### Phase 1: Core backend
- Database migrations (sla_policy, client, client_project, ticket, ticket_message, attachment columns)
- sqlc queries
- SLA policy CRUD API
- Client CRUD API (with project assignment)
- Ticket CRUD API (internal + portal)
- Ticket message API (replies + notes)
- SLA computation logic

### Phase 2: Client portal
- Client auth middleware
- Portal API endpoints
- Portal UI: dashboard, create ticket, ticket detail, reply thread
- Email notifications for ticket events

### Phase 3: Internal views
- Sidebar navigation (Tickets section)
- Ticket list page with filters
- Ticket detail page (replies tab, notes tab, right sidebar)
- Create/link issue from ticket
- SLA Monitor page
- Workspace Settings: SLA Policies tab, Members UI update for client invites

### Phase 4: Automations
- Critical ticket → auto-add to cycle + Slack alert
- Linked issue done → ticket resolved + pending_reply
- SLA breach cron job + Slack warnings
- Real-time sync via WebSocket events
