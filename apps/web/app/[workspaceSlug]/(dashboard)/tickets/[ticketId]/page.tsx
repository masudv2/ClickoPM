"use client";

import { use } from "react";
import { TicketDetailPage } from "@multica/views/tickets/components";

export default function Page({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = use(params);
  return <TicketDetailPage ticketId={ticketId} />;
}
