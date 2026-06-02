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
