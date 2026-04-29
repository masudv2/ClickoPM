"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspaceId } from "@multica/core/hooks";
import { useFileUpload } from "@multica/core/hooks/use-file-upload";
import { api } from "@multica/core/api";
import { portalProjectListOptions, useCreatePortalTicket } from "@multica/core/tickets";
import type { TicketType, TicketPriority } from "@multica/core/types";
import { Paperclip, X } from "lucide-react";
import { FileUploadButton } from "@multica/ui/components/common/file-upload-button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@multica/ui/components/ui/dialog";
import { Button } from "@multica/ui/components/ui/button";
import { Input } from "@multica/ui/components/ui/input";
import { Textarea } from "@multica/ui/components/ui/textarea";
import { Label } from "@multica/ui/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@multica/ui/components/ui/select";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PortalCreateTicketDialog({ open, onOpenChange }: Props) {
  const wsId = useWorkspaceId();
  const { data: projects = [] } = useQuery(portalProjectListOptions(wsId));
  const createTicket = useCreatePortalTicket();

  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<TicketType>("question");
  const [priority, setPriority] = useState<TicketPriority>("normal");
  const [projectId, setProjectId] = useState("");
  const [attachedFiles, setAttachedFiles] = useState<{ id: string; filename: string; url: string }[]>([]);
  const { uploadWithToast, uploading } = useFileUpload(api);

  const effectiveProjectId = projects.length === 1 ? projects[0]!.id : projectId;

  async function handleFileSelect(file: File) {
    const result = await uploadWithToast(file);
    if (result) {
      setAttachedFiles((prev) => [...prev, { id: result.id, filename: result.filename, url: result.link }]);
    }
  }

  function removeFile(id: string) {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  }

  const handleSubmit = () => {
    if (!subject.trim() || !effectiveProjectId) return;
    const desc = [
      description.trim(),
      ...attachedFiles.map((f) => `[${f.filename}](${f.url})`),
    ].filter(Boolean).join("\n");
    createTicket.mutate(
      {
        project_id: effectiveProjectId,
        client_id: "",
        subject: subject.trim(),
        description: desc || undefined,
        type,
        priority,
        source: "portal",
      },
      {
        onSuccess: () => {
          setSubject("");
          setDescription("");
          setType("question");
          setPriority("normal");
          setProjectId("");
          setAttachedFiles([]);
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>New Ticket</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject</Label>
            <Input
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Brief summary of your issue"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Provide details about your issue..."
              className="min-h-[100px] resize-y"
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
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => { if (v) setType(v as TicketType); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="question">Question</SelectItem>
                  <SelectItem value="bug">Bug Report</SelectItem>
                  <SelectItem value="feature_request">Feature Request</SelectItem>
                  <SelectItem value="task">Task</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => { if (v) setPriority(v as TicketPriority); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-muted-foreground/50" />Low
                    </span>
                  </SelectItem>
                  <SelectItem value="normal">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-blue-400" />Normal
                    </span>
                  </SelectItem>
                  <SelectItem value="high">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-orange-400" />High
                    </span>
                  </SelectItem>
                  <SelectItem value="critical">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-red-400" />Critical
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {projects.length > 1 && (
            <div className="space-y-1.5">
              <Label>Project</Label>
              <Select value={projectId} onValueChange={(v) => { if (v) setProjectId(v); }}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((proj) => (
                    <SelectItem key={proj.id} value={proj.id}>
                      {proj.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex justify-end border-t border-border pt-4">
            <Button
              onClick={handleSubmit}
              disabled={!subject.trim() || !effectiveProjectId || createTicket.isPending}
            >
              {createTicket.isPending ? "Submitting..." : "Submit Ticket"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
