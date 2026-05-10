"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, Pause, Play, Square, X, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@multica/ui/components/ui/button";
import { Tooltip, TooltipTrigger, TooltipContent } from "@multica/ui/components/ui/tooltip";
import { cn } from "@multica/ui/lib/utils";

// SpeechRecognition is a web API available on Chrome/Edge/Safari/Electron via
// the `webkitSpeechRecognition` prefix or the standard name. Define a thin
// shape so we can use it without pulling in dom-speech-recognition types.
type SpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};
type SRInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type SRConstructor = new () => SRInstance;

function getSpeechRecognition(): SRConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SRConstructor;
    webkitSpeechRecognition?: SRConstructor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type RecorderState = "idle" | "recording" | "paused" | "ended";

/** Trigger button + popover-style controls for voice input.
 *  Lives in the chat input bar's left adornment. */
export function VoiceRecorder({
  onTranscript,
  disabled,
}: {
  /** Called with the final transcript when recording ends. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const recognitionRef = useRef<SRInstance | null>(null);
  const finalTranscriptRef = useRef("");
  const [state, setState] = useState<RecorderState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  // Wall-clock duration of the recording (paused time excluded).
  const [elapsed, setElapsed] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const SR = getSpeechRecognition();
    setSupported(!!SR);
  }, []);

  const startTicker = useCallback(() => {
    if (tickRef.current) return;
    tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);
  const stopTicker = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const buildRecognition = useCallback((): SRInstance | null => {
    const SR = getSpeechRecognition();
    if (!SR) return null;
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = (typeof navigator !== "undefined" && navigator.language) || "en-US";

    r.onresult = (e) => {
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]!;
        const text = result[0].transcript;
        if (result.isFinal) {
          finalTranscriptRef.current += text;
        } else {
          interimChunk += text;
        }
      }
      setInterim(interimChunk);
    };
    r.onerror = (e) => {
      // "no-speech" and "aborted" are routine — don't show as errors.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(e.error || "Recording error");
      }
    };
    r.onend = () => {
      // Browser auto-stops periodically. If we're still meant to be recording,
      // restart so it feels continuous to the user.
      if (recognitionRef.current === r && (state === "recording")) {
        try {
          r.start();
        } catch {
          // ignore — happens if start is called too quickly after stop
        }
      }
    };
    return r;
  }, [state]);

  const start = useCallback(() => {
    setError(null);
    finalTranscriptRef.current = "";
    setInterim("");
    setElapsed(0);
    const r = buildRecognition();
    if (!r) {
      setError("Speech recognition is not available in this browser");
      return;
    }
    recognitionRef.current = r;
    try {
      r.start();
      setState("recording");
      startTicker();
    } catch (e) {
      setError((e as Error).message || "Failed to start recording");
    }
  }, [buildRecognition, startTicker]);

  const pause = useCallback(() => {
    const r = recognitionRef.current;
    if (!r) return;
    setState("paused");
    stopTicker();
    try {
      r.stop();
    } catch {
      // ignore
    }
  }, [stopTicker]);

  const resume = useCallback(() => {
    const r = recognitionRef.current ?? buildRecognition();
    if (!r) return;
    recognitionRef.current = r;
    setState("recording");
    startTicker();
    try {
      r.start();
    } catch {
      // ignore
    }
  }, [buildRecognition, startTicker]);

  const end = useCallback(() => {
    const r = recognitionRef.current;
    if (r) {
      try {
        r.abort();
      } catch {
        // ignore
      }
    }
    recognitionRef.current = null;
    stopTicker();
    setState("ended");
    const finalText = (finalTranscriptRef.current + " " + interim).trim();
    if (finalText) onTranscript(finalText);
    finalTranscriptRef.current = "";
    setInterim("");
    // Reset the picker after a beat so it can be opened again
    setTimeout(() => setState("idle"), 50);
  }, [interim, onTranscript, stopTicker]);

  const cancel = useCallback(() => {
    const r = recognitionRef.current;
    if (r) {
      try {
        r.abort();
      } catch {
        // ignore
      }
    }
    recognitionRef.current = null;
    stopTicker();
    finalTranscriptRef.current = "";
    setInterim("");
    setElapsed(0);
    setState("idle");
  }, [stopTicker]);

  // Cleanup on unmount.
  useEffect(() => () => {
    stopTicker();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
  }, [stopTicker]);

  if (!supported) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" disabled>
              <Mic className="size-4 opacity-50" />
            </Button>
          }
        />
        <TooltipContent>Voice input not supported in this browser</TooltipContent>
      </Tooltip>
    );
  }

  if (state === "idle" || state === "ended") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              onClick={start}
              className="text-muted-foreground"
            >
              <Mic className="size-4" />
            </Button>
          }
        />
        <TooltipContent>Voice input</TooltipContent>
      </Tooltip>
    );
  }

  // Recording or paused — show inline control row
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const time = `${mins}:${String(secs).padStart(2, "0")}`;

  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-accent/60 px-2 py-1">
      <span className={cn("size-2 rounded-full", state === "recording" ? "bg-red-500 animate-pulse" : "bg-muted-foreground")} />
      <span className="text-xs font-medium tabular-nums text-foreground">{time}</span>
      {error && <span className="text-xs text-destructive ml-1">{error}</span>}
      {state === "recording" ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button type="button" variant="ghost" size="icon-sm" onClick={pause}>
                <Pause className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>Pause</TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger
            render={
              <Button type="button" variant="ghost" size="icon-sm" onClick={resume}>
                <Play className="size-3.5" />
              </Button>
            }
          />
          <TooltipContent>Resume</TooltipContent>
        </Tooltip>
      )}
      <Tooltip>
        <TooltipTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" onClick={end}>
              <Square className="size-3.5" />
            </Button>
          }
        />
        <TooltipContent>Stop &amp; insert</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" onClick={cancel}>
              <X className="size-3.5" />
            </Button>
          }
        />
        <TooltipContent>Cancel</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Collapsed/expanded pill for an attached voice transcript above the chat
 *  textarea. Click chevron to expand to full text; X to remove. */
export function VoiceTranscriptPill({
  text,
  onRemove,
}: {
  text: string;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="mx-3 mt-2 rounded-md border border-border/70 bg-muted/40">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
          <Mic className="size-3" />
          <span>Voice — {wordCount} {wordCount === 1 ? "word" : "words"}</span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Remove voice transcript"
        >
          <X className="size-3" />
        </button>
      </div>
      {expanded && (
        <div className="border-t border-border/70 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto">
          {text}
        </div>
      )}
    </div>
  );
}
