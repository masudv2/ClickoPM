"use client";

import { use } from "react";
import { PortalTicketDetailPage } from "@multica/views/portal";

export default function Page({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = use(params);
  return <PortalTicketDetailPage ticketId={ticketId} />;
}
