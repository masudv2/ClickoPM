"use client";

import { use } from "react";
import { ProjectsPage } from "@multica/views/projects/components";

export default function TeamProjectsPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = use(params);
  return <ProjectsPage teamIdentifier={identifier} />;
}
