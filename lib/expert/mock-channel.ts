"use client";

/**
 * MockExpertChannel — event-driven scripted chat that *feels* like a live
 * connection: it walks script steps, emits `typing` then `message` events
 * after randomized 1500–3000ms delays, and halts at steps that expect a
 * user reply until send() is called.
 *
 * Resume: connect(cursor) starts from cursor.stepIndex. If the cursor says
 * awaiting:'user', the last question is re-emitted (so a remounted chat
 * re-asks instead of silently stalling); awaiting:'expert' resumes emitting
 * from that step.
 *
 * StrictMode safety: every setTimeout id is tracked and cleared in
 * disconnect(); connect() is idempotent via the `started` flag.
 */

import type { ChatMessage, ConversationCursor } from "@/lib/session-store";
import type {
  ConnectionStatus,
  ExpertConnection,
  ExpertEvents,
  ExpertScript,
} from "./types";

const MIN_DELAY = 1500;
const MAX_DELAY = 3000;

function replyDelay(): number {
  return MIN_DELAY + Math.random() * (MAX_DELAY - MIN_DELAY);
}

type Handlers = { [E in keyof ExpertEvents]: Set<ExpertEvents[E]> };

export class MockExpertChannel implements ExpertConnection {
  private script: ExpertScript;
  private timeouts = new Set<ReturnType<typeof setTimeout>>();
  private handlers: Handlers = {
    message: new Set(),
    typing: new Set(),
    status: new Set(),
    done: new Set(),
    cursor: new Set(),
  };
  private started = false;
  private disposed = false;
  private stepIndex = 0;
  private awaiting: ConversationCursor["awaiting"] = "expert";

  constructor(script: ExpertScript) {
    this.script = script;
  }

  on<E extends keyof ExpertEvents>(event: E, handler: ExpertEvents[E]): () => void {
    this.handlers[event].add(handler);
    return () => this.handlers[event].delete(handler);
  }

  private emit<E extends keyof ExpertEvents>(
    event: E,
    ...args: Parameters<ExpertEvents[E]>
  ): void {
    this.handlers[event].forEach((handler) =>
      (handler as (...a: Parameters<ExpertEvents[E]>) => void)(...args),
    );
  }

  private later(ms: number, fn: () => void): void {
    const id = setTimeout(() => {
      this.timeouts.delete(id);
      if (!this.disposed) fn();
    }, ms);
    this.timeouts.add(id);
  }

  private expertMessage(text: string): ChatMessage {
    return { id: crypto.randomUUID(), role: "expert", text, at: Date.now() };
  }

  private setStatus(status: ConnectionStatus): void {
    this.emit("status", status);
  }

  private publishCursor(): void {
    this.emit("cursor", { stepIndex: this.stepIndex, awaiting: this.awaiting });
  }

  connect(cursor?: ConversationCursor): void {
    if (this.started || this.disposed) return; // idempotent (StrictMode)
    this.started = true;
    this.setStatus("connecting");

    this.later(800, () => {
      this.setStatus("connected");

      if (!cursor) {
        // Fresh conversation: greeting, then step 0.
        this.awaiting = "expert";
        this.deliver([this.script.greeting], () => this.runStep(0));
        return;
      }

      this.stepIndex = cursor.stepIndex;
      if (cursor.awaiting === "done") {
        this.awaiting = "done";
        this.emit("done");
        return;
      }
      if (cursor.awaiting === "user") {
        // Re-ask the pending question so the remounted chat isn't stuck.
        this.awaiting = "user";
        const step = this.script.steps[cursor.stepIndex];
        const lastQuestion = step?.expertMessages[step.expertMessages.length - 1];
        this.deliver(
          lastQuestion ? ["Are you still there? Repeating my last question:", lastQuestion] : [],
          () => this.publishCursor(),
        );
        return;
      }
      // awaiting 'expert': resume emitting from this step.
      this.runStep(cursor.stepIndex);
    });
  }

  /** Emit messages one at a time, typing indicator before each. */
  private deliver(texts: string[], then: () => void): void {
    if (texts.length === 0) {
      then();
      return;
    }
    const [head, ...rest] = texts;
    this.emit("typing", true);
    this.later(replyDelay(), () => {
      this.emit("typing", false);
      this.emit("message", this.expertMessage(head));
      this.deliver(rest, then);
    });
  }

  private runStep(index: number): void {
    this.stepIndex = index;
    if (index >= this.script.steps.length) {
      this.awaiting = "done";
      this.publishCursor();
      this.setStatus("done");
      this.emit("done");
      return;
    }
    this.awaiting = "expert";
    this.publishCursor();
    const step = this.script.steps[index];
    this.deliver(step.expertMessages, () => {
      if (step.expectsUserReply) {
        this.awaiting = "user";
        this.publishCursor();
      } else {
        this.runStep(index + 1);
      }
    });
  }

  send(text: string): void {
    // Host renders the user message; the scripted channel ignores its
    // content and only advances the script.
    void text;
    if (this.awaiting !== "user") return;
    this.runStep(this.stepIndex + 1);
  }

  simulatedLineFor(stepIndex: number): string | undefined {
    return this.script.steps[stepIndex]?.simulatedUserLine;
  }

  disconnect(): void {
    this.disposed = true;
    this.timeouts.forEach((id) => clearTimeout(id));
    this.timeouts.clear();
  }
}
