/**
 * Centralized URL path builder. All navigation in shared packages (packages/views)
 * MUST go through this module — no hardcoded string paths.
 *
 * Two kinds of paths:
 *  - workspace-scoped: paths.workspace(slug).xxx() — carry workspace in URL
 *  - global: paths.login(), paths.newWorkspace(), paths.invite(id) — pre-workspace routes
 *
 * Why pure functions + builder pattern:
 *  - Changing a route shape (e.g. adding workspace slug prefix) becomes a single-file edit
 *  - IDs are always URL-encoded here so callers can't forget
 *  - Zero runtime deps means this module is safe in Node (tests) and browsers
 */

const encode = (id: string) => encodeURIComponent(id);

function workspaceScoped(slug: string) {
  const ws = `/${encode(slug)}`;
  return {
    root: () => `${ws}/issues`,
    dashboard: () => `${ws}/dashboard`,
    issues: () => `${ws}/issues`,
    issueDetail: (id: string) => `${ws}/issues/${encode(id)}`,
    roadmap: () => `${ws}/roadmap`,
    projects: () => `${ws}/projects`,
    projectDetail: (id: string) => `${ws}/projects/${encode(id)}`,
    // Team-scoped paths
    teamIssues: (identifier: string) => `${ws}/team/${encode(identifier)}/issues`,
    teamIssueDetail: (identifier: string, id: string) => `${ws}/team/${encode(identifier)}/issues/${encode(id)}`,
    teamProjects: (identifier: string) => `${ws}/team/${encode(identifier)}/projects`,
    teamProjectDetail: (identifier: string, id: string) => `${ws}/team/${encode(identifier)}/projects/${encode(id)}`,
    teamCycles: (identifier: string) => `${ws}/team/${encode(identifier)}/cycles`,
    teamCycleDetail: (identifier: string, cycleId: string) => `${ws}/team/${encode(identifier)}/cycles/${encode(cycleId)}`,
    teamCycleCurrent: (identifier: string) => `${ws}/team/${encode(identifier)}/cycles/current`,
    teamCycleUpcoming: (identifier: string) => `${ws}/team/${encode(identifier)}/cycles/upcoming`,
    teamSettings: (identifier: string) => `${ws}/team/${encode(identifier)}/settings`,
    autopilots: () => `${ws}/autopilots`,
    autopilotDetail: (id: string) => `${ws}/autopilots/${encode(id)}`,
    agents: () => `${ws}/agents`,
    inbox: () => `${ws}/inbox`,
    chat: () => `${ws}/chat`,
    myIssues: () => `${ws}/my-issues`,
    runtimes: () => `${ws}/runtimes`,
    skills: () => `${ws}/skills`,
    skillDetail: (id: string) => `${ws}/skills/${encode(id)}`,
    workload: () => `${ws}/workload`,
    settings: () => `${ws}/settings`,
    // Ticketing (internal team)
    tickets: () => `${ws}/tickets`,
    ticketDetail: (id: string) => `${ws}/tickets/${encode(id)}`,
    clients: () => `${ws}/clients`,
    clientDetail: (id: string) => `${ws}/clients/${encode(id)}`,
    // Portal (client-facing)
    portal: () => `${ws}/portal/tickets`,
    portalTicketDetail: (id: string) => `${ws}/portal/tickets/${encode(id)}`,
  };
}

export const paths = {
  workspace: workspaceScoped,

  // Global (pre-workspace) routes
  login: () => "/login",
  newWorkspace: () => "/workspaces/new",
  invite: (id: string) => `/invite/${encode(id)}`,
  onboarding: () => "/onboarding",
  authCallback: () => "/auth/callback",
  root: () => "/",
};

export type WorkspacePaths = ReturnType<typeof workspaceScoped>;

// Prefixes — not slug names — because we match against full URL paths.
// A path is global if it equals or begins with any of these.
// Note: `/workspaces/` (trailing slash) is the prefix — `workspaces` is reserved,
// so any path starting with `/workspaces/...` is system-owned, not user-owned.
const GLOBAL_PREFIXES = ["/login", "/workspaces/", "/invite/", "/onboarding", "/auth/", "/logout", "/signup"];

export function isGlobalPath(path: string): boolean {
  return GLOBAL_PREFIXES.some((p) => path === p || path.startsWith(p));
}
