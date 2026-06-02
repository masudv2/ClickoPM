import type { Project } from "../types";

export function splitProjectsByArchiveStatus(projects: Project[]) {
  return {
    active: projects.filter((p) => p.archived_at === null),
    archived: projects.filter((p) => p.archived_at !== null),
  };
}
