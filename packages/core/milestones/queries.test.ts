import { describe, it, expect } from "vitest";
import { milestoneKeys, projectMilestonesOptions, milestoneDetailOptions } from "./queries";

describe("milestoneKeys", () => {
  it("scopes by workspace and project", () => {
    expect(milestoneKeys.all("ws-1")).toEqual(["milestones", "ws-1"]);
    expect(milestoneKeys.byProject("ws-1", "p-1")).toEqual([
      "milestones",
      "ws-1",
      "project",
      "p-1",
    ]);
    expect(milestoneKeys.detail("ws-1", "m-1")).toEqual(["milestones", "ws-1", "m-1"]);
  });

  it("workspace keys do not collide across workspaces", () => {
    expect(milestoneKeys.all("ws-1")).not.toEqual(milestoneKeys.all("ws-2"));
  });
});

describe("projectMilestonesOptions", () => {
  it("uses byProject key and is enabled when project is set", () => {
    const opts = projectMilestonesOptions("ws-1", "p-1");
    expect(opts.queryKey).toEqual(["milestones", "ws-1", "project", "p-1"]);
    expect(opts.enabled).toBe(true);
  });

  it("disabled when project is empty", () => {
    const opts = projectMilestonesOptions("ws-1", "");
    expect(opts.enabled).toBe(false);
  });
});

describe("milestoneDetailOptions", () => {
  it("uses detail key", () => {
    const opts = milestoneDetailOptions("ws-1", "m-1");
    expect(opts.queryKey).toEqual(["milestones", "ws-1", "m-1"]);
  });
});
