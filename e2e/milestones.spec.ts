import { test, expect } from "@playwright/test";
import { loginAsDefault, createTestApi } from "./helpers";
import type { TestApiClient } from "./fixtures";

// Project helper — fixtures.ts doesn't expose project CRUD, so we hit the API
// directly via the same authedFetch (token + workspace) that TestApiClient owns.
async function createProject(api: TestApiClient, title: string) {
  const token = api.getToken();
  const res = await fetch(
    `${process.env.E2E_API_BASE ?? "http://localhost:8080"}/api/projects`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Workspace-Slug": (api as unknown as { workspaceSlug?: string }).workspaceSlug ?? "",
      },
      body: JSON.stringify({ title, team_id: process.env.E2E_TEAM_ID }),
    },
  );
  if (!res.ok) {
    throw new Error(`createProject failed: ${res.status} ${await res.text()}`);
  }
  return res.json() as Promise<{ id: string }>;
}

test.describe("Milestones", () => {
  let api: TestApiClient;

  test.beforeEach(async ({ page }) => {
    api = await createTestApi();
    await loginAsDefault(page);
  });

  test.afterEach(async () => {
    if (api) {
      await api.cleanup();
    }
  });

  test("create milestone, assign issue, then delete keeps issue", async () => {
    const project = await createProject(api, "MS Project " + Date.now());
    const milestone = await api.createMilestone(project.id, "Phase 1");
    const issue = await api.createIssue("Task A", {
      project_id: project.id,
      milestone_id: milestone.id,
    });

    const ms = await api.listMilestones(project.id);
    expect(ms).toHaveLength(1);
    expect(ms[0]?.name).toBe("Phase 1");

    await api.deleteMilestone(milestone.id);

    // Issue should still exist with milestone_id cleared
    const updated = await api.updateIssue(issue.id, {});
    expect(updated.milestone_id).toBeNull();
  });
});
