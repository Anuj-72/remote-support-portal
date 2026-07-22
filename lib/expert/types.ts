/**
 * ExpertConnection — the seam between chat UI and its backing transport.
 *
 * MockExpertChannel (scripted, event-driven) and LiveExpertChannel
 * (LLM-backed) both implement this interface, so the chat components
 * never know which one they're talking to. Swapping mock → real
 * WebSocket backend means adding a third implementation, nothing else.
 */

import type { ChatMessage, ConversationCursor } from "@/lib/session-store";

export type ExpertPhase = "scoping" | "qa";
export type ConnectionStatus = "connecting" | "connected" | "done" | "error";

export interface ExpertEvents {
  message: (message: ChatMessage) => void;
  typing: (isTyping: boolean) => void;
  status: (status: ConnectionStatus) => void;
  /** Fired when the script/conversation reaches its end. */
  done: () => void;
  /** Cursor advanced — host persists it for resume. */
  cursor: (cursor: ConversationCursor) => void;
}

export interface ExpertConnection {
  /** Begin (or resume, given a cursor) emitting expert messages. */
  connect(cursor?: ConversationCursor): void;
  /** Technician sends a message; the channel decides what happens next. */
  send(text: string): void;
  /** Tear down: clear all pending timers/streams. Safe to call twice. */
  disconnect(): void;
  on<E extends keyof ExpertEvents>(event: E, handler: ExpertEvents[E]): () => void;
  /** Pre-canned technician line for the current step, if the script has
   *  one — powers the "Simulate speech" bonus button. */
  simulatedLineFor(stepIndex: number): string | undefined;
}

/** Script shape served by GET /api/expert/script. */
export interface ScriptStep {
  id: string;
  expertMessages: string[];
  expectsUserReply: boolean;
  /** Pre-canned line for the "Simulate speech" bonus button. */
  simulatedUserLine?: string;
}

export interface ExpertScript {
  greeting: string;
  steps: ScriptStep[];
}
