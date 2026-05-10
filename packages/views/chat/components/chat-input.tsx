"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { ContentEditor, type ContentEditorRef } from "../../editor";
import { SubmitButton } from "@multica/ui/components/common/submit-button";
import { useChatStore, DRAFT_NEW_SESSION } from "@multica/core/chat";
import { createLogger } from "@multica/core/logger";
import { VoiceRecorder, VoiceTranscriptPill } from "./voice-recorder";

const logger = createLogger("chat.ui");

interface ChatInputProps {
  onSend: (content: string, attachmentIds?: string[]) => void;
  onStop?: () => void;
  isRunning?: boolean;
  disabled?: boolean;
  /** Name of the currently selected agent, used in the placeholder. */
  agentName?: string;
  /** Rendered at the bottom-left of the input bar — typically the agent picker. */
  leftAdornment?: ReactNode;
  /** Rendered just before the submit button — used for context-anchor action. */
  rightAdornment?: ReactNode;
  /** Rendered inside the rounded container, above the editor — attached
   *  context cards, drafts, etc. */
  topSlot?: ReactNode;
}

interface PendingAttachment {
  /** Local id for list keying. */
  localId: string;
  /** Server-assigned attachment id once upload completes. Undefined while uploading. */
  remoteId?: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploading: boolean;
  error?: string;
}

export function ChatInput({
  onSend,
  onStop,
  isRunning,
  disabled,
  agentName,
  leftAdornment,
  rightAdornment,
  topSlot,
}: ChatInputProps) {
  const editorRef = useRef<ContentEditorRef>(null);
  const activeSessionId = useChatStore((s) => s.activeSessionId);
  const selectedAgentId = useChatStore((s) => s.selectedAgentId);
  // Scope the new-chat draft by agent:
  //   1. Switching agents while composing a brand-new chat gives each
  //      agent its own draft (no cross-agent leakage).
  //   2. Tiptap's Placeholder extension is only applied at mount; this
  //      key changes on agent switch so the editor remounts and the
  //      `Tell {agent} what to do…` placeholder refreshes.
  const draftKey =
    activeSessionId ?? `${DRAFT_NEW_SESSION}:${selectedAgentId ?? ""}`;
  // Select a primitive — empty-string fallback keeps referential stability.
  const inputDraft = useChatStore((s) => s.inputDrafts[draftKey] ?? "");
  const setInputDraft = useChatStore((s) => s.setInputDraft);
  const clearInputDraft = useChatStore((s) => s.clearInputDraft);
  const [isEmpty, setIsEmpty] = useState(!inputDraft.trim());
  // Voice transcript attached to the next message. Lives separately from the
  // editor draft so it can be shown as a collapsible pill above the textarea.
  const [voiceTranscript, setVoiceTranscript] = useState<string>("");
  // Files attached to the next message. Uploaded immediately on selection so
  // the user sees per-file progress; remoteIds are sent on submit.
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);

  const handleSend = () => {
    const typed = editorRef.current?.getMarkdown()?.replace(/(\n\s*)+$/, "").trim() ?? "";
    const voicePart = voiceTranscript.trim()
      ? `\n\n> Voice transcript:\n${voiceTranscript.trim()}`
      : "";
    const content = (typed + voicePart).trim();
    const stillUploading = attachments.some((a) => a.uploading);
    const readyAttachmentIds = attachments
      .filter((a) => a.remoteId && !a.uploading && !a.error)
      .map((a) => a.remoteId!);
    if ((!content && readyAttachmentIds.length === 0) || isRunning || disabled || stillUploading) {
      logger.debug("input.send skipped", {
        emptyContent: !content,
        isRunning,
        disabled,
        stillUploading,
      });
      return;
    }
    const keyAtSend = draftKey;
    logger.info("input.send", {
      contentLength: content.length,
      draftKey: keyAtSend,
      hasVoice: !!voicePart,
      attachmentCount: readyAttachmentIds.length,
    });
    onSend(content, readyAttachmentIds.length > 0 ? readyAttachmentIds : undefined);
    editorRef.current?.clearContent();
    clearInputDraft(keyAtSend);
    setIsEmpty(true);
    setVoiceTranscript("");
    setAttachments([]);
  };

  const handleFiles = (files: FileList | File[] | null) => {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    arr.forEach((file) => {
      const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setAttachments((prev) => [
        ...prev,
        {
          localId,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          uploading: true,
        },
      ]);
      // Lazy import to avoid module cycles in case `api` pulls in something
      // heavy that's not needed for the editor-only path.
      import("@multica/core/api").then(({ api }) =>
        api.uploadFile(file)
          .then((att) => {
            setAttachments((prev) =>
              prev.map((a) =>
                a.localId === localId
                  ? { ...a, remoteId: att.id, uploading: false }
                  : a,
              ),
            );
          })
          .catch((err: Error) => {
            setAttachments((prev) =>
              prev.map((a) =>
                a.localId === localId
                  ? { ...a, uploading: false, error: err.message || "Upload failed" }
                  : a,
              ),
            );
          }),
      );
    });
  };

  const removeAttachment = (localId: string) => {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId));
  };

  const placeholder = disabled
    ? "This session is archived"
    : agentName
      ? `Tell ${agentName} what to do…`
      : "Tell me what to do…";

  const hasVoiceOrText = !isEmpty || !!voiceTranscript.trim();
  const hasReadyAttachment = attachments.some((a) => a.remoteId && !a.uploading && !a.error);
  const stillUploading = attachments.some((a) => a.uploading);

  return (
    <div className="px-5 pb-3 pt-0">
      <div className="relative mx-auto flex min-h-28 max-h-60 w-full max-w-4xl flex-col rounded-lg bg-card pb-9 border-1 border-border transition-colors focus-within:border-brand">
        {topSlot}
        {voiceTranscript && (
          <VoiceTranscriptPill text={voiceTranscript} onRemove={() => setVoiceTranscript("")} />
        )}
        {attachments.length > 0 && (
          <div className="mx-3 mt-2 flex flex-wrap gap-1.5">
            {attachments.map((a) => (
              <AttachmentChip key={a.localId} attachment={a} onRemove={() => removeAttachment(a.localId)} />
            ))}
          </div>
        )}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2">
          <ContentEditor
            // Remount the editor when the active session changes so its
            // uncontrolled defaultValue picks up the new session's draft.
            key={draftKey}
            ref={editorRef}
            defaultValue={inputDraft}
            placeholder={placeholder}
            onUpdate={(md) => {
              setIsEmpty(!md.trim());
              setInputDraft(draftKey, md);
            }}
            onSubmit={handleSend}
            debounceMs={100}
            showBubbleMenu={false}
            submitOnEnter
          />
        </div>
        <div className="absolute bottom-1.5 left-2 flex items-center gap-1">
          {leftAdornment}
          <VoiceRecorder
            disabled={!!disabled}
            onTranscript={(text) => setVoiceTranscript((prev) => (prev ? prev + " " + text : text))}
          />
          <FileAttachButton disabled={!!disabled} onFiles={handleFiles} />
        </div>
        <div className="absolute bottom-1 right-1.5 flex items-center gap-2">
          {rightAdornment}
          <SubmitButton
            onClick={handleSend}
            disabled={(!hasVoiceOrText && !hasReadyAttachment) || !!disabled || stillUploading}
            running={isRunning}
            onStop={onStop}
          />
        </div>
      </div>
    </div>
  );
}

function AttachmentChip({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove: () => void;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-md border border-border/70 bg-muted/40 px-2 py-1 text-xs">
      <span className="size-1.5 rounded-full" style={{
        backgroundColor: attachment.error ? "var(--destructive)" : attachment.uploading ? "var(--muted-foreground)" : "var(--primary)",
      }} />
      <span className="truncate max-w-[200px] text-foreground">{attachment.filename}</span>
      {attachment.uploading && <span className="text-muted-foreground">…</span>}
      {attachment.error && <span className="text-destructive" title={attachment.error}>failed</span>}
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        title="Remove"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2.146 2.146a.5.5 0 01.708 0L5 4.293l2.146-2.147a.5.5 0 11.708.708L5.707 5l2.147 2.146a.5.5 0 01-.708.708L5 5.707 2.854 7.854a.5.5 0 01-.708-.708L4.293 5 2.146 2.854a.5.5 0 010-.708z" /></svg>
      </button>
    </div>
  );
}

function FileAttachButton({ disabled, onFiles }: { disabled?: boolean; onFiles: (files: FileList | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,image/png,image/jpeg,image/webp,image/gif,.txt,.md,.csv,.json"
        className="hidden"
        onChange={(e) => {
          onFiles(e.target.files);
          // Reset so the same file can be picked again
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
        title="Attach file"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 17.93 8.8L9.41 17.32a2 2 0 0 1-2.83-2.83l8.49-8.49"/></svg>
      </button>
    </>
  );
}
