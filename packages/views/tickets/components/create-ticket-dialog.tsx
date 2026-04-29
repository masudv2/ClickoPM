"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { useFileUpload } from "@multica/core/hooks/use-file-upload";
import { api } from "@multica/core/api";
import { clientListOptions, useCreateTicket } from "@multica/core/tickets";
import { projectListOptions } from "@multica/core/projects";
import type { TicketType, TicketPriority } from "@multica/core/types";
import { Paperclip, X } from "lucide-react";
import { FileUploadButton } from "@multica/ui/components/common/file-upload-button";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { Label } from "@multica/ui/components/ui/label";
import { Textarea } from "@multica/ui/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@multica/ui/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@multica/ui/components/ui/select";

const TICKET_TYPES: { value: TicketType; label: string }[] = [
  { value: "support", label: "Support" },
  { value: "bug", label: "Bug" },
  { value: "question", label: "Question" },
  { value: "feature_request", label: "Feature Request" },
  { value: "task", label: "Task" },
];

const TICKET_PRIORITIES: { value: TicketPriority; label: string }[] = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
];

const PRIORITY_DOT: Record<TicketPriority, string> = {
  critical: "bg-red-400",
  high: "bg-orange-400",
  normal: "bg-blue-400",
  low: "bg-muted-foreground/50",
};

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateTicketDialog({ open, onOpenChange }: CreateTicketDialogProps) {
  const wsId = useWorkspaceId();
  const createTicket = useCreateTicket();

  const { data: clients = [] } = useQuery(clientListOptions(wsId));
  const { data: projects = [] } = useQuery(projectListOptions(wsId));

  const [clientId, setClientId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TicketType>("support");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [attachedFiles, setAttachedFiles] = useState<{ id: string; filename: string; url: string }[]>([]);
  const { uploadWithToast, uploading } = useFileUpload(api);

  async function handleFileSelect(file: File) {
    const result = await uploadWithToast(file);
    if (result) {
      setAttachedFiles((prev) => [...prev, { id: result.id, filename: result.filename, url: result.link }]);
    }
  }

  function removeFile(id: string) {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  function reset() {
    setClientId("");
    setProjectId("");
    setSubject("");
    setDescription("");
    setType("support");
    setPriority("normal");
    setAttachedFiles([]);
  }

  function handleSubmit() {
    if (!clientId || !projectId || !subject.trim()) return;
    const desc = [
      description.trim(),
      ...attachedFiles.map((f) => `[${f.filename}](${f.url})`),
    ].filter(Boolean).join("\n");
    createTicket.mutate(
      {
        client_id: clientId,
        project_id: projectId,
        subject: subject.trim(),
        description: desc || undefined,
        type,
        priority,
        source: "internal",
      },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
        },
      },
    );
  }

  const canSubmit = !!clientId && !!projectId && !!subject.trim() && !createTicket.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Ticket</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Client</Label>
            <Select value={clientId} onValueChange={(v) => { if (v) setClientId(v); }}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.user_name}
                    {c.company_name ? ` (${c.company_name})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Project</Label>
            <Select value={projectId} onValueChange={(v) => { if (v) setProjectId(v); }}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief description of the issue"
              className="text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details (optional)"
              className="min-h-[80px] text-xs resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <FileUploadButton
                size="sm"
                onSelect={handleFileSelect}
                disabled={uploading}
              />
              <span className="text-xs text-muted-foreground">
                {uploading ? "Uploading..." : "Attach file"}
              </span>
            </div>
            {attachedFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
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
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as TicketType)}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TicketPriority)}>
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full ${PRIORITY_DOT[p.value]}`} />
                        {p.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={!canSubmit}>
              {createTicket.isPending ? "Creating..." : "Create Ticket"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
