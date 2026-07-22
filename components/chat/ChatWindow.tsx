"use client";

import { useEffect, useRef } from "react";
import type { ChatMessage } from "@/lib/session-store";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";

/**
 * Scrollable transcript pane; auto-scrolls to the newest message.
 */
export function ChatWindow({
  transcript,
  typing,
}: {
  transcript: ChatMessage[];
  typing: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript.length, typing]);

  return (
    <div
      className="flex h-80 flex-col gap-2 overflow-y-auto p-4"
      role="log"
      aria-live="polite"
      aria-label="Chat with remote expert"
    >
      {transcript.length === 0 && !typing && (
        <p className="m-auto text-sm text-slate-400 dark:text-slate-500">
          Connecting you to a remote expert…
        </p>
      )}
      {transcript.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      {typing && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
