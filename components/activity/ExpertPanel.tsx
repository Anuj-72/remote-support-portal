"use client";

/**
 * ExpertPanel — a complete expert chat: connection + transcript + input
 * + bonus controls (TTS mute toggle, Simulate speech). Used by both the
 * scoping (Tab 1) and QA (Tab 3) tabs; only props differ.
 */

import { useEffect, useRef } from "react";
import type { Equipment, Severity } from "@/lib/mission";
import type { ConversationState } from "@/lib/session-store";
import type { ExpertPhase } from "@/lib/expert/types";
import type { ExpertMode } from "@/lib/expert/create-connection";
import { useExpertConnection } from "@/hooks/useExpertConnection";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { ChatInput } from "@/components/chat/ChatInput";
import { SimulateSpeechButton } from "@/components/chat/SimulateSpeechButton";

export function ExpertPanel({
  mode,
  phase,
  equipment,
  severity,
  initial,
  onDone,
}: {
  mode: ExpertMode;
  phase: ExpertPhase;
  equipment: Equipment;
  severity: Severity;
  initial: ConversationState | null;
  onDone: (done: boolean) => void;
}) {
  const { transcript, typing, status, done, sendMessage, canSend, getSimulatedLine } =
    useExpertConnection({ mode, phase, equipment, severity, initial });
  const { supported: ttsSupported, muted, toggleMuted, speak } = useSpeechSynthesis();

  // Speak newly arrived expert messages (only additions, not the resumed
  // transcript — spokenCountRef starts at the initial length).
  const spokenCountRef = useRef(initial?.transcript.length ?? 0);
  useEffect(() => {
    for (let i = spokenCountRef.current; i < transcript.length; i++) {
      if (transcript[i].role === "expert") speak(transcript[i].text);
    }
    spokenCountRef.current = transcript.length;
  }, [transcript, speak]);

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);
  useEffect(() => {
    onDoneRef.current(done);
  }, [done]);

  return (
    <div className="flex flex-col rounded-xl border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`h-2 w-2 rounded-full ${
              status === "connected" || status === "done"
                ? "bg-green-500"
                : status === "error"
                  ? "bg-red-500"
                  : "animate-pulse bg-amber-500"
            }`}
            aria-hidden="true"
          />
          <span className="font-medium">Remote Expert</span>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-700 dark:text-slate-300">
            {mode === "live" ? "Live AI" : "Scripted"}
          </span>
        </div>
        {ttsSupported && (
          <button
            type="button"
            onClick={toggleMuted}
            aria-pressed={!muted}
            className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
          >
            {muted ? "🔇 Voice off" : "🔊 Voice on"}
          </button>
        )}
      </div>

      {status === "error" ? (
        <p role="alert" className="p-6 text-center text-sm text-red-600 dark:text-red-400">
          Could not reach the expert service. Check your connection and reload
          the page — your conversation is saved.
        </p>
      ) : (
        <>
          <ChatWindow transcript={transcript} typing={typing} />
          <div className="flex items-center gap-2 px-3">
            <SimulateSpeechButton
              canSend={canSend}
              getLine={getSimulatedLine}
              onSend={sendMessage}
            />
          </div>
          <ChatInput canSend={canSend} onSend={sendMessage} />
        </>
      )}
    </div>
  );
}
