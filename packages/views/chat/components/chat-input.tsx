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
  onSend: (content: string) => void;
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

  const handleSend = () => {
    const typed = editorRef.current?.getMarkdown()?.replace(/(\n\s*)+$/, "").trim() ?? "";
    // Compose final content from typed text + voice transcript. Voice is
    // labelled so the agent's prompt knows to summarize long transcripts.
    const voicePart = voiceTranscript.trim()
      ? `\n\n> Voice transcript:\n${voiceTranscript.trim()}`
      : "";
    const content = (typed + voicePart).trim();
    if (!content || isRunning || disabled) {
      logger.debug("input.send skipped", {
        emptyContent: !content,
        isRunning,
        disabled,
      });
      return;
    }
    const keyAtSend = draftKey;
    logger.info("input.send", { contentLength: content.length, draftKey: keyAtSend, hasVoice: !!voicePart });
    onSend(content);
    editorRef.current?.clearContent();
    clearInputDraft(keyAtSend);
    setIsEmpty(true);
    setVoiceTranscript("");
  };

  const placeholder = disabled
    ? "This session is archived"
    : agentName
      ? `Tell ${agentName} what to do…`
      : "Tell me what to do…";

  const hasVoiceOrText = !isEmpty || !!voiceTranscript.trim();

  return (
    <div className="px-5 pb-3 pt-0">
      <div className="relative mx-auto flex min-h-28 max-h-60 w-full max-w-4xl flex-col rounded-lg bg-card pb-9 border-1 border-border transition-colors focus-within:border-brand">
        {topSlot}
        {voiceTranscript && (
          <VoiceTranscriptPill text={voiceTranscript} onRemove={() => setVoiceTranscript("")} />
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
            // Chat is short-form — the floating formatting toolbar is
            // more distraction than feature here.
            showBubbleMenu={false}
            // Enter sends; Shift-Enter inserts a hard break.
            submitOnEnter
          />
        </div>
        <div className="absolute bottom-1.5 left-2 flex items-center gap-1">
          {leftAdornment}
          <VoiceRecorder
            disabled={!!disabled}
            onTranscript={(text) => setVoiceTranscript((prev) => (prev ? prev + " " + text : text))}
          />
        </div>
        <div className="absolute bottom-1 right-1.5 flex items-center gap-2">
          {rightAdornment}
          <SubmitButton
            onClick={handleSend}
            disabled={!hasVoiceOrText || !!disabled}
            running={isRunning}
            onStop={onStop}
          />
        </div>
      </div>
    </div>
  );
}
