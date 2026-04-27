"use client";

import { use } from "react";
import { CyclesListPage } from "@multica/views/cycles/components";

export default function TeamCyclesPage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = use(params);
  return <CyclesListPage teamIdentifier={identifier} />;
}
