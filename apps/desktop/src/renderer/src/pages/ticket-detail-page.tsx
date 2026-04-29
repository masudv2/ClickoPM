import { useParams } from "react-router-dom";
import { TicketDetailPage } from "@multica/views/tickets/components";

export function DesktopTicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  if (!ticketId) return null;
  return <TicketDetailPage ticketId={ticketId} />;
}
