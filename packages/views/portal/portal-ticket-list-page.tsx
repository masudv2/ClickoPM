"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { portalTicketListOptions, portalProjectListOptions } from "@multica/core/tickets";
import type { Ticket, TicketClientStatus } from "@multica/core/types";
import { Card, CardContent } from "@multica/ui/components/ui/card";
import { Badge } from "@multica/ui/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@multica/ui/components/ui/select";
import { cn } from "@multica/ui/lib/utils";
import { AppLink } from "../navigation";
import { PortalLayout } from "./portal-layout";
import { PortalCreateTicketDialog } from "./portal-create-ticket-dialog";
import { Inbox } from "lucide-react";

const STATUS_CONFIG: Record<TicketClientStatus, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  in_progress: { label: "In Progress", className: "bg-green-500/15 text-green-400 border-green-500/30" },
  awaiting_response: { label: "Awaiting Response", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  resolved: { label: "Resolved", className: "bg-muted text-muted-foreground border-border" },
  closed: { label: "Closed", className: "bg-muted text-muted-foreground border-border" },
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function PortalTicketListPage() {
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const { data: tickets = [] } = useQuery(portalTicketListOptions(wsId));
  const { data: projects = [] } = useQuery(portalProjectListOptions(wsId));
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, awaiting_response: 0, resolved: 0 };
    for (const t of tickets) {
      if (t.client_status === "open") c.open++;
      else if (t.client_status === "in_progress") c.in_progress++;
      else if (t.client_status === "awaiting_response") c.awaiting_response++;
      else if (t.client_status === "resolved" || t.client_status === "closed") c.resolved++;
    }
    return c;
  }, [tickets]);

  const filtered = useMemo(() => {
    let result = tickets;
    if (statusFilter !== "all") {
      result = result.filter((t) => t.client_status === statusFilter);
    }
    if (projectFilter !== "all") {
      result = result.filter((t) => t.project_id === projectFilter);
    }
    return result;
  }, [tickets, statusFilter, projectFilter]);

  return (
    <PortalLayout onNewTicket={() => setCreateOpen(true)}>
      <div className="mx-auto max-w-[860px] px-6 py-6">
        {/* Stat Cards */}
        <div className="mb-6 grid grid-cols-4 gap-3">
          <StatCard label="Open" count={counts.open} className="text-blue-400" />
          <StatCard label="In Progress" count={counts.in_progress} className="text-green-400" />
          <StatCard label="Awaiting You" count={counts.awaiting_response} className="text-amber-400" />
          <StatCard label="Resolved" count={counts.resolved} className="text-muted-foreground" />
        </div>

        {/* Filters */}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-foreground">Tickets</h2>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => { if (v) setStatusFilter(v); }}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="awaiting_response">Awaiting Response</SelectItem>
                <SelectItem value="resolved">Resolved</SelectItem>
              </SelectContent>
            </Select>
            {projects.length > 1 && (
              <Select value={projectFilter} onValueChange={(v) => { if (v) setProjectFilter(v); }}>
                <SelectTrigger className="h-8 w-[160px] text-xs">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((proj) => (
                    <SelectItem key={proj.id} value={proj.id}>
                      {proj.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Ticket List */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
            <Inbox className="mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {tickets.length === 0
                ? "No tickets yet. Click New Ticket to get started."
                : "No tickets match your filters."}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-4 py-2 text-left font-medium">ID</th>
                  <th className="px-4 py-2 text-left font-medium">Subject</th>
                  <th className="px-4 py-2 text-left font-medium">Priority</th>
                  <th className="px-4 py-2 text-left font-medium">Type</th>
                  <th className="px-4 py-2 text-left font-medium">Project</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-left font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ticket) => (
                  <TicketRow
                    key={ticket.id}
                    ticket={ticket}
                    href={p.portalTicketDetail(ticket.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PortalCreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PortalLayout>
  );
}

function StatCard({ label, count, className }: { label: string; count: number; className?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className={cn("text-2xl font-semibold", className)}>{count}</div>
      </CardContent>
    </Card>
  );
}

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  critical: { label: "Critical", className: "bg-red-500/15 text-red-400 border-red-500/30" },
  high: { label: "High", className: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  normal: { label: "Normal", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  low: { label: "Low", className: "bg-muted text-muted-foreground border-border" },
};

const TYPE_LABELS: Record<string, string> = {
  bug: "Bug",
  question: "Question",
  feature_request: "Feature",
  task: "Task",
  support: "Support",
  change_request: "Change",
  clarification: "Clarification",
};

function TicketRow({ ticket, href }: { ticket: Ticket; href: string }) {
  const config = STATUS_CONFIG[ticket.client_status] ?? STATUS_CONFIG.open;
  const priorityCfg = PRIORITY_CONFIG[ticket.priority] || { label: ticket.priority, className: "" };
  const isResolved = ticket.client_status === "resolved" || ticket.client_status === "closed";

  return (
    <tr className={cn(
      "group border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors",
      isResolved && "opacity-60",
    )}>
      <td className="px-4 py-2.5">
        <AppLink href={href} className="font-mono text-[11px] text-muted-foreground hover:text-foreground transition-colors">
          {ticket.identifier}
        </AppLink>
      </td>
      <td className="px-4 py-2.5 max-w-[280px]">
        <div className="flex items-center gap-2 min-w-0">
          {ticket.client_status === "awaiting_response" && (
            <span className="size-1.5 shrink-0 rounded-full bg-amber-400" title="Awaiting your response" />
          )}
          <AppLink href={href} className="truncate text-[13px] text-foreground hover:text-foreground transition-colors">
            {ticket.subject}
          </AppLink>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", priorityCfg.className)}>
          {priorityCfg.label}
        </Badge>
      </td>
      <td className="px-4 py-2.5">
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
          {TYPE_LABELS[ticket.type] ?? ticket.type}
        </Badge>
      </td>
      <td className="px-4 py-2.5">
        <span className="text-[12px] text-muted-foreground">{ticket.project_title ?? "--"}</span>
      </td>
      <td className="px-4 py-2.5">
        <Badge variant="outline" className={cn("text-[11px]", config.className)}>
          {config.label}
        </Badge>
      </td>
      <td className="px-4 py-2.5">
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {formatRelativeTime(ticket.created_at)}
        </span>
      </td>
    </tr>
  );
}
