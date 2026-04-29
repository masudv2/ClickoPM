# Project Status & Deployment Guide

> Last updated: 2026-04-30

This document gives a new agent or developer full context to continue working on the project. Read this alongside `CLAUDE.md` (coding rules, architecture) and the design specs in `docs/superpowers/specs/`.

## Deployment

### Infrastructure (Dokploy)

The app is deployed on a self-hosted Dokploy instance at `http://187.77.2.10:3000`.

| Component | Dokploy App ID | Domain |
|-----------|---------------|--------|
| **Backend** (Go) | `-Q_lVeu5Zn2oiYgmwWEqa` | `ops.clickodigital.com` (proxied) |
| **Frontend** (Next.js) | `aTqnce6A3jEeFiXK50Sjp` | `ops.clickodigital.com` |
| **PostgreSQL** | `iXplTb82Ha76a9RelLspC` | Internal only |

- Frontend proxies all API calls to backend via Next.js rewrites (`/api/*`, `/ws`, `/auth/*`, `/uploads/*`). No separate API subdomain needed.
- Cookies use `SameSite: Strict` — works because frontend and API share the same domain via proxy.
- The Dokploy API uses `x-api-key` header (not Bearer). The app IDs starting with `-` break the Dokploy CLI, so use direct tRPC API calls instead.

### Auto-Deploy

GitHub webhooks are configured on `masudv2/ClickoPM` (the deployment repo). Every push to `main` triggers both backend and frontend rebuilds automatically.

```bash
# Push to deploy
git push clickopm main
```

The `origin` remote points to `multica-ai/multica` (upstream). The `clickopm` remote points to `masudv2/ClickoPM` (deployment). Always push to `clickopm` for deployment.

### Backend Environment Variables

Set in Dokploy (not in git):

```
DATABASE_URL=postgresql://clicko:***@postgres-override-redundant-sensor-a9na3m:5432/clicko?sslmode=disable
APP_ENV=production
PORT=8080
ALLOW_SIGNUP=false
LOCAL_UPLOAD_DIR=/data/uploads
LOCAL_UPLOAD_BASE_URL=/uploads
JWT_SECRET=***
RESEND_API_KEY=re_JfXpt56H_***
RESEND_FROM_EMAIL=support@clickodigital.com
FRONTEND_ORIGIN=https://ops.clickodigital.com
SLACK_BOT_TOKEN=xoxb-***
```

### Frontend Build Args

```
REMOTE_API_URL=http://clicko-digital-ops-6hblwe:8080
NEXT_PUBLIC_WS_URL=wss://ops.clickodigital.com/ws
```

### File Uploads

Using local storage (not S3/R2). Files stored at `/data/uploads` inside the container. The entrypoint script creates this directory automatically. A Docker volume must be mounted at `/data/uploads` for persistence across deploys.

## Access Control

- **Public signup is disabled** (`ALLOW_SIGNUP=false`). Only invited members can join.
- Invited users bypass onboarding — the accept-invitation handler auto-marks them as onboarded, and the login/callback pages honor `?next=/invite/{id}` before checking onboarding status.
- Users with pending invitations are allowed through the signup gate even when `ALLOW_SIGNUP=false` (checked via `HasPendingInvitationForEmail` query).

## Email

Using **Resend** with verified domain `clickodigital.com`. From address: `support@clickodigital.com`. Used for:
- Auth codes (magic link login)
- Member invitations
- Client invitations (ticketing)
- Ticket reply notifications

## Theme

Dark mode is forced globally via `forcedTheme="dark"` on the ThemeProvider. Light/system options have been removed from the appearance settings and search command palette.

## CLI

The `multica` CLI is how AI agents interact with the platform. It connects to the production server.

### Setup

```bash
# Build the CLI locally
cd server && go build -o ~/bin/multica ./cmd/multica

# Login (do NOT use `multica setup` — it hardcodes multica.ai URLs)
multica login
```

The CLI config lives at `~/.multica/config.json`:
```json
{
  "server_url": "https://ops.clickodigital.com",
  "app_url": "https://ops.clickodigital.com",
  "workspace_id": "<your-workspace-uuid>",
  "token": "mul_***"
}
```

**Warning:** `multica setup` overwrites the config with hardcoded `multica.ai` URLs. Always use `multica login` for self-hosted instances.

### Available CLI Commands

| Command | Subcommands | Description |
|---------|-------------|-------------|
| `issue` | list, get, create, update, assign, status, comment, subscriber, search, runs, rerun, run-messages | Full issue management |
| `project` | list, get, create, update, delete, status | Project management |
| `cycle` | list, get, create, update, delete, start, complete | Sprint cycle management |
| `ticket` | list, get, create, update, delete, messages, reply, create-issue | Ticket/support management |
| `team` | list, get, create, update, delete, members | Team management |
| `label` | list, create, update, delete | Label management |
| `agent` | list, get, create, update, archive, restore, tasks, skills | AI agent management |
| `autopilot` | list, get, create, update, delete, trigger, runs | Autopilot configuration |
| `skill` | list, get, create, update, delete, import, files | Skill management |
| `runtime` | list, usage, activity, update | Runtime management |
| `workspace` | list, get, members | Workspace info |
| `dashboard` | (default) | Dashboard summary (JSON) |
| `workload` | (default) | Workload data (JSON) |
| `inbox` | list, unread, read, archive | Inbox/notifications |
| `attachment` | download | File downloads |

### Label Colors

Labels use named colors, not hex codes: `red`, `orange`, `amber`, `yellow`, `lime`, `green`, `teal`, `blue`, `indigo`, `purple`, `pink`, `gray`.

### Daemon (Local Agent Runtime)

The daemon runs on each Mac that needs AI agent execution. It's per-machine — if you use multiple computers, each needs its own daemon.

```bash
multica daemon start    # Start daemon
multica daemon status   # Check status
multica daemon logs     # View logs
```

## Feature Status

### Core Features (Stable)
- Issues (CRUD, comments, assignments, labels, status workflow, sub-issues)
- Projects (CRUD, status tracking, progress)
- Teams (CRUD, members, per-team settings)
- Cycles/Sprints (auto-creation via sweeper, burndown, capacity planning)
- Dashboard (stat cards, overdue tracking, team health)
- Workload view (per-member capacity and velocity)
- Roadmap view
- AI Agents (assign to issues, run tasks, comment)
- Autopilots (automated triggers)
- Skills (agent skill library)
- Real-time (WebSocket events, optimistic updates)
- Inbox/notifications
- Search (full-text issue search)
- Labels (colored, workspace-scoped)
- File attachments (local storage)

### Ticketing System (In Progress)

Built in 4 phases:

1. **Phase 1 — Backend** (DONE): Database tables, Go API handlers, auth middleware for clients, tickets, ticket messages, SLA policies. Routes: `/api/tickets`, `/api/clients`, `/api/sla-policies`, `/api/portal/*`.

2. **Phase 2 — Client Portal UI** (DONE): Portal layout, ticket list, ticket detail with conversation thread, create ticket, resolve/reopen controls. Client-facing pages using `/api/portal/*` endpoints.

3. **Phase 3 — Internal Views** (DONE): Admin tickets list page (stat cards, SLA monitor, filters), ticket detail (convert to issue, assignee picker, colored dropdowns), SLA policies settings tab, clients settings tab.

4. **Phase 4 — Automations** (DONE): SLA breach checker (background goroutine), critical ticket auto-escalation, ticket inbox notifications.

### Slack Integration (Active)
- Bot token configured in production
- Daily/evening/weekly/sprint reports to team Slack channels
- Bug alerts for critical issues
- Team settings tab for channel configuration

### Recent Changes (2026-04-29 to 2026-04-30)
- Sidebar: projects under teams default to expanded, Briefcase icon
- Invited users can signup when `ALLOW_SIGNUP=false`
- Invited users skip onboarding (honor `?next=` URL before onboarding redirect)
- Dark mode forced globally
- Slack bot token added to production
- CLI expanded with cycle, ticket, team, label, dashboard, workload, inbox commands
- Labels created: Bug, Feature, Improvement, Documentation, Frontend, Backend, DevOps, Design, QA
- Upload directory auto-created in Docker entrypoint

## Key Files

### Backend
- `server/cmd/server/router.go` — All API routes
- `server/cmd/server/main.go` — Server entry point
- `server/cmd/server/report_scheduler.go` — Background Slack report scheduler
- `server/cmd/server/cycle_sweeper.go` — Auto-creates cycles, advances status, snapshots history
- `server/internal/handler/` — All HTTP handlers
- `server/internal/service/` — Slack, email services
- `server/internal/auth/` — JWT, cookies, middleware
- `server/internal/storage/` — File storage (local + S3)
- `server/pkg/db/queries/` — SQL queries (edit these, then `make sqlc`)
- `server/pkg/db/generated/` — Auto-generated Go from SQL (never edit directly)
- `server/migrations/` — Database migrations
- `server/cmd/multica/` — CLI commands

### Frontend
- `packages/core/` — Business logic, stores, API client, hooks, types
- `packages/views/` — Shared page components (issues, cycles, tickets, settings, etc.)
- `packages/ui/` — Atomic UI components (shadcn-based)
- `apps/web/app/` — Next.js routes and page wrappers
- `apps/web/app/auth/callback/page.tsx` — Post-login routing
- `apps/web/app/(auth)/login/page.tsx` — Login page with redirect handling

### Configuration
- `Dockerfile` — Backend Docker build
- `Dockerfile.web` — Frontend Docker build
- `docker/entrypoint.sh` — Container startup (migrations + upload dir)
- `.env` — Local dev environment (not committed)
- `fly.backend.toml` / `fly.web.toml` — Fly.io configs (not currently used)

## Getting Started on a New Machine

```bash
# 1. Clone the repo
git clone https://github.com/masudv2/ClickoPM.git multica
cd multica

# 2. Add remotes
git remote add origin https://github.com/multica-ai/multica.git  # upstream
git remote rename origin clickopm  # or keep as-is

# 3. Start everything
make dev  # Auto-creates env, installs deps, starts DB, migrates, launches app

# 4. Build CLI
cd server && go build -o ~/bin/multica ./cmd/multica

# 5. Login CLI to production
multica login  # Opens browser, authenticates, saves token

# 6. Start daemon (if you need AI agent execution on this machine)
multica daemon start
```
