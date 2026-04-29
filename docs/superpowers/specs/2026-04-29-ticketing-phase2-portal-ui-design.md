# Ticketing Phase 2 — Client Portal UI

## Goal

Build the client-facing portal UI so clients (role="client") can create tickets, view their ticket list, have conversations with the support team, and resolve/reopen tickets. Clients can also invite teammates who share the same projects.

## Architecture

**Layout fork approach**: When the workspace layout detects `role === "client"`, it renders `PortalLayout` instead of `DashboardLayout`. The portal is a minimal shell — header bar + content area, no sidebar.

**Routes**: All portal pages live under `/{slug}/portal/...` using the existing workspace slug routing. Three pages total.

**API**: All backend endpoints already exist from Phase 1 (`/api/portal/*`). This phase is frontend-only.

## Design Decisions

1. **Minimal portal (not scoped dashboard)** — Clients see only their tickets. No sidebar, no internal nav. Clean header with workspace branding, New Ticket button, Invite Teammate button, and user avatar.
2. **Simple flat ticket list** — All tickets in one list, newest first. Status badges per row. Status + project filter dropdowns. Stat cards at top (Open, In Progress, Awaiting You, Resolved).
3. **Auto-select project** — If client has one project, skip the picker in the create ticket form. Show dropdown only when multiple projects.
4. **Named team replies** — Show the team member's name with a "Support" badge. Clients see replies only, never internal notes.
5. **Company-based multi-user** — When a client invites a colleague, the new user gets the same `company_name`, `sla_policy_id`, and `project_ids` as the inviter. No new tables needed.
6. **Same workspace slug routing** — `/{slug}/portal/tickets`, `/{slug}/portal/tickets/:id`. Workspace resolved from existing middleware.

## Pages

### 1. Portal Ticket List (`/{slug}/portal/tickets`)

- **Stat cards row**: 4 cards — Open (blue), In Progress (green), Awaiting You (amber), Resolved (muted). Counts from API.
- **Filters**: Status dropdown (All/Open/In Progress/Awaiting Response/Resolved) + Project dropdown (if client has multiple projects).
- **Ticket rows**: Identifier (TKT-N), subject, project name, status badge, relative time. Orange dot on "awaiting response" tickets. Resolved rows dimmed (opacity).
- **Empty state**: Friendly message + CTA to create first ticket.

### 2. Portal Ticket Detail (`/{slug}/portal/tickets/:id`)

- **Back link**: Returns to ticket list.
- **Ticket header**: Identifier, status badge, priority badge, subject line. Project name + "opened X ago" metadata.
- **Metadata bar**: Priority, type, status at a glance. "Mark Resolved" button (or "Reopen" if already resolved).
- **Conversation thread**: Chronological messages. Client messages have user avatar. Team messages have avatar + "Support" badge. Only reply-type messages shown (notes filtered server-side).
- **Reply composer**: Textarea at bottom with attach button placeholder and "Send Reply" button.

### 3. Create Ticket Dialog

- **Triggered from**: "New Ticket" button in header. Opens as a dialog/sheet, not a separate page.
- **Fields**: Subject (required), Description (textarea), Type (dropdown: question/bug/feature_request/task, defaults to "question"), Priority (dropdown: low/normal/high/critical, defaults to "normal"), Project (auto-selected if single project, dropdown if multiple).
- **Submit**: Calls `createPortalTicket`, on success navigates to the new ticket detail.

### 4. Invite Teammate Dialog

- **Triggered from**: "Invite Teammate" button in header.
- **Fields**: Email address (required).
- **Backend**: Calls `CreateClientWithInvite` with the inviter's same `project_ids`, `company_name`, and `sla_policy_id`.
- **Success**: Shows confirmation toast.

## Layout Components

### PortalLayout (`packages/views/portal/portal-layout.tsx`)

- Header bar: workspace icon + name, "Support Portal" label, New Ticket button, Invite Teammate button, user profile dropdown (email + logout).
- Content slot: renders child page.
- No sidebar, no team nav.

### PortalGuard

- Fetches current member, checks `role === "client"`.
- If not client, redirects to the normal dashboard.
- Provides client context (client record, projects) to child pages.

## Routing Integration

### Web (`apps/web/`)

- New route group: `apps/web/app/[workspaceSlug]/(portal)/portal/`
  - `layout.tsx` — wraps with `PortalLayout`
  - `tickets/page.tsx` — renders `PortalTicketListPage`
  - `tickets/[id]/page.tsx` — renders `PortalTicketDetailPage`
- In `[workspaceSlug]/layout.tsx` or `(dashboard)/layout.tsx`: if member role is "client", redirect to `/{slug}/portal/tickets`.

### Desktop

- Add portal routes to desktop router under `/:slug/portal/tickets` and `/:slug/portal/tickets/:id`.
- Same layout fork: if role is "client", render `PortalLayout` instead of dashboard shell.

## Backend Changes

### New endpoint: Invite teammate from portal

Need a new endpoint or extend existing `CreateClientWithInvite` so a client user can invite another user. The portal invite should:
1. Look up the inviter's client record to get their `company_name`, `sla_policy_id`, and project IDs.
2. Call the same `CreateClientWithInvite` logic with those values.
3. Only clients should be able to call this (not create arbitrary clients).

**Route**: `POST /api/portal/invite` with body `{ "email": "colleague@company.com" }`.

### Portal query hooks

New hooks in `packages/core/tickets/`:
- `usePortalTickets(wsId)` — calls `listPortalTickets`
- `usePortalTicket(wsId, id)` — calls `getPortalTicket`
- `usePortalTicketMessages(wsId, id)` — calls `listPortalTicketMessages`
- `usePortalProjects(wsId)` — calls `listPortalProjects`
- Portal mutations: `useCreatePortalTicket`, `useCreatePortalReply`, `useResolvePortalTicket`, `useReopenPortalTicket`, `useInviteTeammate`

## File Structure

```
packages/views/portal/
  portal-layout.tsx          # Header + content shell
  portal-ticket-list-page.tsx # Stat cards + ticket list + filters
  portal-ticket-detail-page.tsx # Conversation thread + reply composer
  portal-create-ticket-dialog.tsx # New ticket form dialog
  portal-invite-dialog.tsx   # Invite teammate dialog
  index.ts                   # Exports

packages/core/tickets/
  queries.ts                 # Add portal query options
  mutations.ts               # Add portal mutations
  
packages/core/paths/paths.ts # Add portal paths

apps/web/app/[workspaceSlug]/(portal)/portal/
  layout.tsx
  tickets/page.tsx
  tickets/[id]/page.tsx

server/internal/handler/
  client.go                  # Add InviteTeammateFromPortal handler
  
server/cmd/server/router.go  # Add POST /api/portal/invite route
```

## Implementation uses Multica design system

All components must use:
- shadcn components (`Card`, `Button`, `Badge`, `Dialog`, `Select`, `Textarea`, etc.)
- Semantic design tokens (`bg-background`, `text-muted-foreground`, `border-border`, etc.)
- No hardcoded colors — only token references
- Existing patterns from `packages/ui/` and `packages/views/`
