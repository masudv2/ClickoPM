"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CircleDot,
  Clock,
  MessageCircle,
  Plus,
  Ticket,
} from "lucide-react";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { ticketListOptions, slaMonitorOptions } from "@multica/core/tickets";
import type {
  Ticket as TicketType,
  TicketInternalStatus,
  TicketPriority,
} from "@multica/core/types";
import { Badge } from "@multica/ui/components/ui/badge";
import { Button } from "@multica/ui/components/ui/button";
import { Card, CardContent } from "@multica/ui/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@multica/ui/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@multica/ui/components/ui/select";
import { cn } from "@multica/ui/lib/utils";
import { useActorName } from "@multica/core/workspace/hooks";
import { AppLink } from "../../navigation";
import { PageHeader } from "../../layout/page-header";
import { CreateTicketDialog } from "./create-ticket-dialog";

const INTERNAL_STATUSES: { value: TicketInternalStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "triaged", label: "Triaged" },
  { value: "in_progress", label: "In Progress" },
  { value: "waiting_on_client", label: "Waiting on Client" },
  { value: "waiting_on_third_party", label: "Waiting on Third Party" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

const STATUS_BADGE: Record<TicketInternalStatus, string> = {
  new: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  triaged: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  in_progress: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  waiting_on_client: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  waiting_on_third_party: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  resolved: "bg-green-500/15 text-green-400 border-green-500/30",
  closed: "bg-muted text-muted-foreground border-border",
};

const PRIORITY_BADGE: Record<TicketPriority, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  normal: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

function formatStatusLabel(status: TicketInternalStatus): string {
  return INTERNAL_STATUSES.find((s) => s.value === status)?.label ?? status;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function isSLABreached(ticket: TicketType): boolean {
  const now = Date.now();
  if (ticket.first_response_due && !ticket.first_response_at) {
    if (new Date(ticket.first_response_due).getTime() < now) return true;
  }
  if (ticket.resolution_due && !ticket.resolved_at) {
    if (new Date(ticket.resolution_due).getTime() < now) return true;
  }
  return false;
}

function slaBreachType(ticket: TicketType): string {
  const now = Date.now();
  const parts: string[] = [];
  if (ticket.first_response_due && !ticket.first_response_at && new Date(ticket.first_response_due).getTime() < now) {
    parts.push("First response");
  }
  if (ticket.resolution_due && !ticket.resolved_at && new Date(ticket.resolution_due).getTime() < now) {
    parts.push("Resolution");
  }
  return parts.join(", ") || "SLA";
}

function overdueLabel(due: string): string {
  const diffMs = Date.now() - new Date(due).getTime();
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return "<1h overdue";
  if (hours < 24) return `${hours}h overdue`;
  return `${Math.floor(hours / 24)}d overdue`;
}

export function TicketsListPage() {
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [pendingReplyOnly, setPendingReplyOnly] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [breachedSheetOpen, setBreachedSheetOpen] = useState(false);

  const queryParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (statusFilter !== "all") params.internal_status = statusFilter;
    if (priorityFilter !== "all") params.priority = priorityFilter;
    return Object.keys(params).length > 0 ? params : undefined;
  }, [statusFilter, priorityFilter]);

  const { data, isLoading } = useQuery(ticketListOptions(wsId, queryParams));
  const tickets = data?.tickets ?? [];
  const { getActorName } = useActorName();

  const { data: slaData } = useQuery(slaMonitorOptions(wsId));

  const breachedIds = useMemo(() => {
    const ids = new Set<string>();
    slaData?.breached.forEach((t) => ids.add(t.id));
    slaData?.at_risk.forEach((t) => ids.add(t.id));
    return ids;
  }, [slaData]);

  const filteredTickets = useMemo(() => {
    if (!pendingReplyOnly) return tickets;
    return tickets.filter((t) => t.pending_reply);
  }, [tickets, pendingReplyOnly]);

  // Stat counts
  const openCount = useMemo(
    () => tickets.filter((t) => t.internal_status !== "resolved" && t.internal_status !== "closed").length,
    [tickets],
  );
  const pendingCount = useMemo(
    () => tickets.filter((t) => t.pending_reply).length,
    [tickets],
  );
  const breachedCount = slaData?.breached.length ?? 0;
  const atRiskCount = slaData?.at_risk.length ?? 0;

  const statCards = [
    {
      label: "Open",
      value: openCount,
      icon: CircleDot,
      iconClass: "text-blue-500",
    },
    {
      label: "Pending Reply",
      value: pendingCount,
      icon: MessageCircle,
      iconClass: pendingCount > 0 ? "text-orange-500" : "text-muted-foreground",
      valueClass: pendingCount > 0 ? "text-orange-500" : "",
    },
    {
      label: "SLA Breached",
      value: breachedCount,
      icon: AlertTriangle,
      iconClass: breachedCount > 0 ? "text-destructive" : "text-muted-foreground",
      valueClass: breachedCount > 0 ? "text-destructive" : "",
      clickable: true,
      onClick: () => setBreachedSheetOpen(true),
    },
    {
      label: "At Risk",
      value: atRiskCount,
      icon: Clock,
      iconClass: atRiskCount > 0 ? "text-amber-500" : "text-muted-foreground",
      valueClass: atRiskCount > 0 ? "text-amber-500" : "",
    },
  ];

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <PageHeader className="gap-2">
        <Ticket className="size-4 text-muted-foreground" />
        <h1 className="text-sm font-medium">Tickets</h1>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-7 gap-1 text-xs"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="size-3.5" />
          New Ticket
        </Button>
      </PageHeader>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 px-4 py-3 md:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card
              key={card.label}
              className={card.clickable ? "cursor-pointer transition-colors hover:bg-muted/50" : ""}
              onClick={card.onClick}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <div className={`mt-0.5 rounded-md bg-muted p-1.5 ${card.iconClass}`}>
                  <Icon className="size-3.5" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className={`text-xl font-semibold tabular-nums ${card.valueClass ?? ""}`}>
                    {card.value}
                  </p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            if (v) setStatusFilter(v);
          }}
        >
          <SelectTrigger size="sm" className="text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {INTERNAL_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={priorityFilter}
          onValueChange={(v) => {
            if (v) setPriorityFilter(v);
          }}
        >
          <SelectTrigger size="sm" className="text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priorities</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-7 text-xs transition-colors",
            pendingReplyOnly
              ? "border-orange-500/30 bg-orange-500/15 text-orange-400"
              : "border-input bg-transparent text-muted-foreground hover:bg-accent",
          )}
          onClick={() => setPendingReplyOnly(!pendingReplyOnly)}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              pendingReplyOnly ? "bg-orange-400" : "bg-muted-foreground/50",
            )}
          />
          Pending Reply
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
            Loading tickets...
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Ticket className="size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No tickets found</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="px-4 py-2 text-left font-medium">Identifier</th>
                <th className="px-4 py-2 text-left font-medium">Subject</th>
                <th className="px-4 py-2 text-left font-medium">Client</th>
                <th className="px-4 py-2 text-left font-medium">Priority</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
                <th className="px-4 py-2 text-left font-medium">SLA</th>
                <th className="px-4 py-2 text-left font-medium">Assignee</th>
                <th className="px-4 py-2 text-left font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {filteredTickets.map((ticket) => {
                const slaBreach =
                  breachedIds.has(ticket.id) || isSLABreached(ticket);
                return (
                  <tr
                    key={ticket.id}
                    className="group border-b border-border last:border-b-0 hover:bg-accent/50 transition-colors"
                  >
                    <td className="px-4 py-2.5">
                      <AppLink
                        href={p.ticketDetail(ticket.id)}
                        className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {ticket.identifier}
                      </AppLink>
                    </td>
                    <td className="px-4 py-2.5 max-w-[300px]">
                      <div className="flex items-center gap-2 min-w-0">
                        {ticket.pending_reply && (
                          <span className="size-2 shrink-0 rounded-full bg-orange-400" />
                        )}
                        <AppLink
                          href={p.ticketDetail(ticket.id)}
                          className="text-[13px] truncate hover:text-foreground transition-colors"
                        >
                          {ticket.subject}
                        </AppLink>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-col">
                        <span className="text-[13px] truncate max-w-[140px]">
                          {ticket.client_name}
                        </span>
                        {ticket.client_company && (
                          <span className="text-xs text-muted-foreground truncate max-w-[140px]">
                            {ticket.client_company}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[11px] px-1.5 py-0",
                          PRIORITY_BADGE[ticket.priority],
                        )}
                      >
                        {ticket.priority}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[11px] px-1.5 py-0",
                          STATUS_BADGE[ticket.internal_status],
                        )}
                      >
                        {formatStatusLabel(ticket.internal_status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5">
                      {slaBreach ? (
                        <AlertTriangle className="size-4 text-red-400" />
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-[13px] text-muted-foreground truncate max-w-[120px] block">
                        {ticket.assignee_type && ticket.assignee_id
                          ? getActorName(ticket.assignee_type, ticket.assignee_id)
                          : "Unassigned"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatRelativeTime(ticket.updated_at)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <CreateTicketDialog open={createOpen} onOpenChange={setCreateOpen} />

      {/* SLA Breached Sheet */}
      <Sheet open={breachedSheetOpen} onOpenChange={setBreachedSheetOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>SLA Breached ({breachedCount})</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {!slaData?.breached.length ? (
              <p className="text-sm text-muted-foreground">No breached tickets</p>
            ) : (
              slaData.breached.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-start justify-between gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1">
                    <AppLink
                      href={p.ticketDetail(ticket.id)}
                      className="text-sm font-medium text-foreground hover:underline"
                    >
                      {ticket.identifier}
                    </AppLink>
                    <p className="truncate text-sm text-muted-foreground">
                      {ticket.subject}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {slaBreachType(ticket)}
                    </p>
                  </div>
                  <Badge variant="destructive" className="shrink-0">
                    {ticket.first_response_due && !ticket.first_response_at
                      ? overdueLabel(ticket.first_response_due)
                      : ticket.resolution_due
                        ? overdueLabel(ticket.resolution_due)
                        : "Breached"}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
