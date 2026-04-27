"use client";

import { use } from "react";
import { TeamSettingsPage } from "@multica/views/teams";

export default function TeamSettingsRoute({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = use(params);
  return <TeamSettingsPage teamIdentifier={identifier} />;
}
