"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { useFileUpload } from "@multica/core/hooks/use-file-upload";
import { api } from "@multica/core/api";
import { useWorkspacePaths } from "@multica/core/paths";
import {
  portalTicketDetailOptions,
  portalTicketMessagesOptions,
  useCreatePortalReply,
  useResolvePortalTicket,
  useReopenPortalTicket,
} from "@multica/core/tickets";
import type { TicketClientStatus } from "@multica/core/types";
import { Badge } from "@multica/ui/components/ui/badge";
import { Button } from "@multica/ui/components/ui/button";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { ActorAvatar } from "@multica/ui/components/common/actor-avatar";
import { cn } from "@multica/ui/lib/utils";
import { ArrowLeft, CheckCircle2, Paperclip, RotateCcw, Send, X } from "lucide-react";
import { FileUploadButton } from "@multica/ui/components/common/file-upload-button";
import { AppLink } from "../navigation";
import { PortalLayout } from "./portal-layout";

const STATUS_CLASS: Record<TicketClientStatus, string> = {
  open: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  in_progress: "bg-green-500/15 text-green-400 border-green-500/30",
  awaiting_response: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  resolved: "bg-muted text-muted-foreground border-border",
  closed: "bg-muted text-muted-foreground border-border",
};

const PRIORITY_CLASS: Record<string, string> = {
  critical: "bg-red-500/15 text-red-400 border-red-500/30",
  high: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  normal: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function PortalTicketDetailPage({ ticketId }: { ticketId: string }) {
  const wsId = useWorkspaceId();
  const p = useWorkspacePaths();
  const { data: ticket } = useQuery(portalTicketDetailOptions(wsId, ticketId));
  const { data: messages = [] } = useQuery(portalTicketMessagesOptions(wsId, ticketId));
  const [replyBody, setReplyBody] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<{ id: string; filename: string; url: string }[]>([]);
  const { uploadWithToast, uploading } = useFileUpload(api);

  const createReply = useCreatePortalReply();
  const resolveTicket = useResolvePortalTicket();
  const reopenTicket = useReopenPortalTicket();

  async function handleFileSelect(file: File) {
    const result = await uploadWithToast(file, { ticketId });
    if (result) {
      setAttachedFiles((prev) => [...prev, { id: result.id, filename: result.filename, url: result.link }]);
    }
  }

  function removeFile(id: string) {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  const handleSendReply = () => {
    if (!replyBody.trim() && attachedFiles.length === 0) return;
    const body = [
      replyBody.trim(),
      ...attachedFiles.map((f) => `[${f.filename}](${f.url})`),
    ].filter(Boolean).join("\n");
    createReply.mutate({ ticketId, body }, {
      onSuccess: () => { setReplyBody(""); setAttachedFiles([]); },
    });
  };

  const isResolved = ticket?.client_status === "resolved" || ticket?.client_status === "closed";

  if (!ticket) {
    return (
      <PortalLayout>
        <div className="flex h-full items-center justify-center">
          <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="mx-auto max-w-[860px] px-6 py-6">
        {/* Back link */}
        <AppLink
          href={p.portal()}
          className="mb-4 inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <ArrowLeft className="size-3" />
          Back to tickets
        </AppLink>

        {/* Ticket header */}
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{ticket.identifier}</span>
            <Badge variant="outline" className={cn("text-[11px]", STATUS_CLASS[ticket.client_status])}>
              {ticket.client_status.replace(/_/g, " ")}
            </Badge>
            <Badge variant="outline" className={cn("text-[11px] capitalize", PRIORITY_CLASS[ticket.priority])}>
              {ticket.priority}
            </Badge>
          </div>
          <h1 className="text-lg font-semibold text-foreground">{ticket.subject}</h1>
          <div className="mt-1 flex items-center gap-4 text-xs text-muted-foreground">
            {ticket.project_title && <span>{ticket.project_title}</span>}
            <span>Opened {formatRelativeTime(ticket.created_at)}</span>
          </div>
        </div>

        {/* Metadata bar */}
        <div className="mb-6 flex items-center gap-6 rounded-lg border border-border bg-card px-4 py-3 text-xs">
          <div>
            <span className="text-muted-foreground">Priority</span>
            <span className={cn("ml-1.5 font-medium capitalize", PRIORITY_CLASS[ticket.priority]?.split(" ")[1])}>
              {ticket.priority}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Type</span>
            <span className="ml-1.5 capitalize text-foreground">{ticket.type.replace(/_/g, " ")}</span>
          </div>
          <div className="ml-auto">
            {isResolved ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => reopenTicket.mutate(ticketId)}
                disabled={reopenTicket.isPending}
              >
                <RotateCcw className="mr-1.5 size-3.5" />
                Reopen
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="border-green-500/30 text-green-400 hover:bg-green-500/10"
                onClick={() => resolveTicket.mutate(ticketId)}
                disabled={resolveTicket.isPending}
              >
                <CheckCircle2 className="mr-1.5 size-3.5" />
                Mark Resolved
              </Button>
            )}
          </div>
        </div>

        {/* Conversation thread */}
        <div className="mb-6 space-y-4">
          {/* Original description as first message */}
          {ticket.description && (
            <MessageBubble
              senderName={ticket.client_name}
              senderType="client"
              body={ticket.description}
              createdAt={ticket.created_at}
            />
          )}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              senderName={msg.sender_name ?? "Support"}
              senderType={msg.sender_type}
              body={msg.body}
              createdAt={msg.created_at}
            />
          ))}
        </div>

        {/* Reply composer */}
        {!isResolved && (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <Textarea
              value={replyBody}
              onChange={(e) => setReplyBody(e.target.value)}
              placeholder="Write a reply..."
              className="min-h-[80px] resize-y border-0 bg-transparent focus-visible:ring-0"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSendReply();
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
            <div className="flex items-center justify-between border-t border-border px-3 py-2">
              <FileUploadButton
                size="sm"
                onSelect={handleFileSelect}
                disabled={uploading}
              />
              <Button
                size="sm"
                onClick={handleSendReply}
                disabled={(!replyBody.trim() && attachedFiles.length === 0) || createReply.isPending}
              >
                <Send className="mr-1.5 size-3.5" />
                Send Reply
              </Button>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function MessageBubble({
  senderName,
  senderType,
  body,
  createdAt,
}: {
  senderName: string;
  senderType: string;
  body: string;
  createdAt: string;
}) {
  const isTeam = senderType === "member";
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <ActorAvatar name={senderName} initials={getInitials(senderName)} size={20} />
        <span className="text-[13px] font-medium text-foreground">{senderName}</span>
        {isTeam && (
          <Badge variant="secondary" className="text-[10px]">
            Support
          </Badge>
        )}
        <span className="text-[11px] text-muted-foreground">{formatRelativeTime(createdAt)}</span>
      </div>
      <div className="ml-8 whitespace-pre-wrap rounded-lg border border-border bg-card px-4 py-3 text-[13px] leading-relaxed text-foreground">
        {body}
      </div>
    </div>
  );
}
