"use client";

import { use } from "react";
import { CycleDetailPage } from "@multica/views/cycles/components";

export default function TeamCycleDetailPage({
  params,
}: {
  params: Promise<{ identifier: string; cycleId: string }>;
}) {
  const { identifier, cycleId } = use(params);
  return <CycleDetailPage cycleId={cycleId} teamIdentifier={identifier} />;
}
