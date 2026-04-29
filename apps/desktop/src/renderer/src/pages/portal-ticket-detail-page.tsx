import { useParams } from "react-router-dom";
import { PortalTicketDetailPage } from "@multica/views/portal";

export function DesktopPortalTicketDetailPage() {
  const { ticketId } = useParams<{ ticketId: string }>();
  if (!ticketId) return null;
  return <PortalTicketDetailPage ticketId={ticketId} />;
}
