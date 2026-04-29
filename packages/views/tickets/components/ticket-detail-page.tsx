import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChevronRight, ExternalLink, Paperclip, Ticket, X } from "lucide-react";
import { FileUploadButton } from "@multica/ui/components/common/file-upload-button";
import { useWorkspaceId } from "@multica/core/hooks";
import { useFileUpload } from "@multica/core/hooks/use-file-upload";
import { api } from "@multica/core/api";
import { useCurrentWorkspace, useWorkspacePaths } from "@multica/core/paths";
import {
  ticketDetailOptions,
  ticketMessagesOptions,
  useUpdateTicket,
  useCreateTicketReply,
  useCreateTicketNote,
  useCreateIssueFromTicket,
} from "@multica/core/tickets";
import { teamListOptions } from "@multica/core/teams";
import type {
  TicketInternalStatus,
  TicketPriority,
  TicketMessage,
  IssueAssigneeType,
} from "@multica/core/types";
import { Badge } from "@multica/ui/components/ui/badge";
import { Button } from "@multica/ui/components/ui/button";
import { Textarea } from "@multica/ui/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@multica/ui/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@multica/ui/components/ui/popover";
import { cn } from "@multica/ui/lib/utils";
import { AppLink } from "../../navigation";
import { PageHeader } from "../../layout/page-header";
import { AssigneePicker } from "../../issues/components/pickers";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / 1000,
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function slaColor(due: string | null): string {
  if (!due) return "text-muted-foreground";
  const diff = new Date(due).getTime() - Date.now();
  if (diff < 0) return "text-destructive";
  if (diff < 60 * 60 * 1000) return "text-amber-500";
  return "text-green-600";
}

function formatSlaDate(due: string | null): string {
  if (!due) return "--";
  return new Date(due).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const STATUS_OPTIONS: { value: TicketInternalStatus; label: string; dot: string }[] = [
  { value: "new", label: "New", dot: "bg-blue-400" },
  { value: "triaged", label: "Triaged", dot: "bg-purple-400" },
  { value: "in_progress", label: "In Progress", dot: "bg-amber-400" },
  { value: "waiting_on_client", label: "Waiting on Client", dot: "bg-orange-400" },
  { value: "waiting_on_third_party", label: "Waiting on 3rd Party", dot: "bg-orange-400" },
  { value: "resolved", label: "Resolved", dot: "bg-green-400" },
  { value: "closed", label: "Closed", dot: "bg-muted-foreground/50" },
];

const PRIORITY_OPTIONS: { value: TicketPriority; label: string; dot: string }[] = [
  { value: "critical", label: "Critical", dot: "bg-red-400" },
  { value: "high", label: "High", dot: "bg-orange-400" },
  { value: "normal", label: "Normal", dot: "bg-blue-400" },
  { value: "low", label: "Low", dot: "bg-muted-foreground/50" },
];

// ---------------------------------------------------------------------------
// Sidebar property row
// ---------------------------------------------------------------------------

function PropRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center gap-2 rounded-md px-2 -mx-2 hover:bg-accent/50 transition-colors">
      <span className="w-24 shrink-0 text-xs text-muted-foreground">
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Message bubble
// ---------------------------------------------------------------------------

function MessageBubble({ message }: { message: TicketMessage }) {
  const isNote = message.type === "note";
  const isMember = message.sender_type === "member";

  return (
    <div
      className={cn(
        "rounded-lg border p-4",
        isNote && "bg-amber-500/5 border-amber-500/20",
      )}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
          {getInitials(message.sender_name ?? "?")}
        </span>
        <span className="text-[13px] font-medium">{message.sender_name ?? "Unknown"}</span>
        {isNote && (
          <Badge
            variant="outline"
            className="border-amber-500/30 text-amber-600 text-[10px] px-1.5 py-0"
          >
            Note
          </Badge>
        )}
        {!isNote && isMember && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0"
          >
            Support
          </Badge>
        )}
        {!isNote && !isMember && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0"
          >
            Client
          </Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {timeAgo(message.created_at)}
        </span>
      </div>
      <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
        {message.body}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Convert to Issue popover
// ---------------------------------------------------------------------------

function ConvertToIssueButton({ ticketId }: { ticketId: string }) {
  const wsId = useWorkspaceId();
  const [open, setOpen] = useState(false);
  const { data: teams = [] } = useQuery({
    ...teamListOptions(wsId),
    enabled: open,
  });
  const createIssue = useCreateIssueFromTicket();

  function handleConvert(teamId: string) {
    createIssue.mutate(
      { ticketId, teamId },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
        <ArrowUpRight className="size-3.5" />
        Convert to Issue
      </PopoverTrigger>
      <PopoverContent className="w-48 p-1" side="left" align="start">
        <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
          Select team
        </p>
        {teams.map((team) => (
          <button
            key={team.id}
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent transition-colors disabled:opacity-50"
            onClick={() => handleConvert(team.id)}
            disabled={createIssue.isPending}
          >
            {team.name}
          </button>
        ))}
        {teams.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            No teams found
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// TicketDetailPage
// ---------------------------------------------------------------------------

export function TicketDetailPage({ ticketId }: { ticketId: string }) {
  const wsId = useWorkspaceId();
  const workspace = useCurrentWorkspace();
  const paths = useWorkspacePaths();

  const { data: ticket, isLoading } = useQuery(
    ticketDetailOptions(wsId, ticketId),
  );
  const { data: messages = [] } = useQuery(
    ticketMessagesOptions(wsId, ticketId),
  );

  const updateTicket = useUpdateTicket();
  const createReply = useCreateTicketReply();
  const createNote = useCreateTicketNote();

  const [composerTab, setComposerTab] = useState<"reply" | "note">("reply");
  const [composerText, setComposerText] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<{ id: string; filename: string; url: string }[]>([]);
  const { uploadWithToast, uploading } = useFileUpload(api);

  async function handleFileSelect(file: File) {
    const result = await uploadWithToast(file, { ticketId });
    if (result) {
      setAttachedFiles((prev) => [...prev, { id: result.id, filename: result.filename, url: result.link }]);
    }
  }

  function removeFile(id: string) {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function handleSubmit() {
    const text = composerText.trim();
    if (!text && attachedFiles.length === 0) return;

    const body = [
      text,
      ...attachedFiles.map((f) => `[${f.filename}](${f.url})`),
    ].filter(Boolean).join("\n");

    if (composerTab === "reply") {
      createReply.mutate(
        { ticketId, body },
        { onSuccess: () => { setComposerText(""); setAttachedFiles([]); } },
      );
    } else {
      createNote.mutate(
        { ticketId, body },
        { onSuccess: () => { setComposerText(""); setAttachedFiles([]); } },
      );
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center text-sm text-muted-foreground">
        Loading...
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        <p>Ticket not found.</p>
      </div>
    );
  }

  const currentStatusDot = STATUS_OPTIONS.find((o) => o.value === ticket.internal_status)?.dot ?? "bg-muted-foreground";
  const currentPriorityDot = PRIORITY_OPTIONS.find((o) => o.value === ticket.priority)?.dot ?? "bg-muted-foreground";

  return (
    <div className="flex flex-1 flex-col min-h-0">
      {/* Breadcrumb header */}
      <PageHeader className="gap-2 bg-background text-sm">
        <div className="flex flex-1 items-center gap-1.5 min-w-0">
          {workspace && (
            <>
              <AppLink
                href={paths.tickets()}
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                {workspace.name}
              </AppLink>
              <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
            </>
          )}
          <AppLink
            href={paths.tickets()}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 flex items-center gap-1"
          >
            <Ticket className="size-3" />
            Tickets
          </AppLink>
          <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />
          <span className="text-foreground font-medium truncate">
            {ticket.identifier}
          </span>
        </div>
      </PageHeader>

      <div className="flex flex-1 min-h-0">
      {/* Left: Conversation */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-6 py-6 space-y-4">
            {/* Title */}
            <h1 className="text-xl font-bold leading-snug">{ticket.subject}</h1>

            {/* Ticket description as first message */}
            {ticket.description && (
              <div className="rounded-lg border p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium">
                    {getInitials(ticket.client_name ?? "Client")}
                  </span>
                  <span className="text-[13px] font-medium">
                    {ticket.client_name ?? "Client"}
                  </span>
                  <Badge
                    variant="secondary"
                    className="text-[10px] px-1.5 py-0"
                  >
                    Client
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {timeAgo(ticket.created_at)}
                  </span>
                </div>
                <p className="text-[13px] leading-relaxed whitespace-pre-wrap">
                  {ticket.description}
                </p>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        </div>

        {/* Composer */}
        <div className="shrink-0 border-t p-4">
          <div className="mx-auto w-full max-w-3xl">
            <div className="flex gap-1 mb-2">
              <button
                type="button"
                onClick={() => setComposerTab("reply")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  composerTab === "reply"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Reply
              </button>
              <button
                type="button"
                onClick={() => setComposerTab("note")}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  composerTab === "note"
                    ? "bg-amber-500/10 text-amber-600"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Internal Note
              </button>
            </div>
            <div
              className={cn(
                "rounded-lg border",
                composerTab === "note" && "bg-amber-500/5 border-amber-500/20",
              )}
            >
              <Textarea
                value={composerText}
                onChange={(e) => setComposerText(e.target.value)}
                placeholder={
                  composerTab === "reply"
                    ? "Write a reply..."
                    : "Add an internal note..."
                }
                className="min-h-[80px] border-0 bg-transparent resize-none focus-visible:ring-0"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              {attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                  {attachedFiles.map((f) => (
                    <span
                      key={f.id}
                      className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs"
                    >
                      <Paperclip className="size-3 text-muted-foreground" />
                      <span className="max-w-[120px] truncate">{f.filename}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(f.id)}
                        className="ml-0.5 rounded hover:bg-muted-foreground/20 p-0.5"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between px-3 pb-3">
                <FileUploadButton
                  size="sm"
                  onSelect={handleFileSelect}
                  disabled={uploading}
                />
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={
                    (!composerText.trim() && attachedFiles.length === 0) ||
                    createReply.isPending ||
                    createNote.isPending
                  }
                >
                  {composerTab === "reply" ? "Send Reply" : "Add Note"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right: Sidebar */}
      <div className="w-80 shrink-0 border-l overflow-y-auto hidden lg:flex lg:flex-col p-4">
        <div className="space-y-5">
          {/* Properties */}
          <div className="space-y-1">
            <PropRow label="Status">
              <Select
                value={ticket.internal_status}
                onValueChange={(v) => {
                  if (v)
                    updateTicket.mutate({
                      id: ticketId,
                      internal_status: v as TicketInternalStatus,
                    });
                }}
              >
                <SelectTrigger className="h-7 w-full text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`size-1.5 rounded-full ${currentStatusDot}`} />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent side="left" align="start">
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full ${o.dot}`} />
                        {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropRow>

            <PropRow label="Priority">
              <Select
                value={ticket.priority}
                onValueChange={(v) => {
                  if (v)
                    updateTicket.mutate({
                      id: ticketId,
                      priority: v as TicketPriority,
                    });
                }}
              >
                <SelectTrigger className="h-7 w-full text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`size-1.5 rounded-full ${currentPriorityDot}`} />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent side="left" align="start">
                  {PRIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full ${o.dot}`} />
                        {o.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </PropRow>

            <PropRow label="Assignee">
              <AssigneePicker
                assigneeType={(ticket.assignee_type as IssueAssigneeType) ?? null}
                assigneeId={ticket.assignee_id}
                onUpdate={(updates) => {
                  updateTicket.mutate({
                    id: ticketId,
                    assignee_type: updates.assignee_type ?? undefined,
                    assignee_id: updates.assignee_id ?? undefined,
                  });
                }}
              />
            </PropRow>

            <PropRow label="Type">
              <span className="capitalize">{ticket.type.replace(/_/g, " ")}</span>
            </PropRow>

            {ticket.project_title && (
              <PropRow label="Project">
                <span className="truncate">{ticket.project_title}</span>
              </PropRow>
            )}

            <PropRow label="Source">
              <span className="capitalize">{ticket.source}</span>
            </PropRow>

            <PropRow label="Created">
              <span>{timeAgo(ticket.created_at)}</span>
            </PropRow>
          </div>

          {/* Client info */}
          <div>
            <p className="text-xs font-medium mb-2 px-2">Client</p>
            <div className="space-y-0.5">
              <PropRow label="Name">
                <span className="truncate">
                  {ticket.client_name ?? "--"}
                </span>
              </PropRow>
              <PropRow label="Company">
                <span className="truncate">
                  {ticket.client_company ?? "--"}
                </span>
              </PropRow>
            </div>
          </div>

          {/* SLA */}
          <div>
            <p className="text-xs font-medium mb-2 px-2">SLA</p>
            <div className="space-y-0.5">
              <PropRow label="First response">
                <span
                  className={cn(
                    "truncate",
                    slaColor(ticket.first_response_due),
                  )}
                >
                  {formatSlaDate(ticket.first_response_due)}
                </span>
              </PropRow>
              <PropRow label="Resolution">
                <span
                  className={cn(
                    "truncate",
                    slaColor(ticket.resolution_due),
                  )}
                >
                  {formatSlaDate(ticket.resolution_due)}
                </span>
              </PropRow>
            </div>
          </div>

          {/* Linked issue */}
          <div>
            <p className="text-xs font-medium mb-2 px-2">Linked Issue</p>
            {ticket.linked_issue_id ? (
              <div className="px-2">
                <AppLink
                  href={paths.issueDetail(ticket.linked_issue_id)}
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="size-3" />
                  View Issue
                </AppLink>
              </div>
            ) : (
              <div className="px-2">
                <ConvertToIssueButton ticketId={ticketId} />
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
