"use client";

import { use } from "react";
import { IssuesPage } from "@multica/views/issues/components";

export default function TeamIssuesPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = use(params);
  return <IssuesPage teamIdentifier={identifier} />;
}
