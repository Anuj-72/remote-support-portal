"use client";

/**
 * LiveExpertChannel — same ExpertConnection interface, but expert replies
 * come from POST /api/expert/chat (LLM, streaming). The scripted flow is
 * kept as scaffolding:
 *  - greeting comes from the script (instant, no LLM round trip)
 *  - `done` fires after the same number of user exchanges the script expects
 *  - ANY fetch/stream failure hot-swaps the remainder of the conversation
 *    to an internal MockExpertChannel at the equivalent cursor position,
 *    so the user never sees a broken chat.
 */

import type { ChatMessage, ConversationCursor } from "@/lib/session-store";
import type {
  ConnectionStatus,
  ExpertConnection,
  ExpertEvents,
  ExpertPhase,
  ExpertScript,
} from "./types";
import { MockExpertChannel } from "./mock-channel";
import type { Equipment, Severity } from "@/lib/mission";

type Handlers = { [E in keyof ExpertEvents]: Set<ExpertEvents[E]> };

export interface LiveConfig {
  phase: ExpertPhase;
  equipment: Equipment;
  severity: Severity;
}

export class LiveExpertChannel implements ExpertConnection {
  private script: ExpertScript;
  private config: LiveConfig;
  private handlers: Handlers = {
    message: new Set(),
    typing: new Set(),
    status: new Set(),
    done: new Set(),
    cursor: new Set(),
  };
  private started = false;
  private disposed = false;
  private history: { role: "user" | "assistant"; content: string }[] = [];
  /** Counts completed user exchanges — maps onto script step indices so
   *  cursors stay interchangeable with the mock channel. */
  private stepIndex = 0;
  private awaiting: ConversationCursor["awaiting"] = "expert";
  private fallback: MockExpertChannel | null = null;
  private abort: AbortController | null = null;

  constructor(script: ExpertScript, config: LiveConfig, initialTranscript: ChatMessage[] = []) {
    this.script = script;
    this.config = config;
    // Rebuild LLM history from the persisted transcript so a resumed live
    // conversation keeps its context (system notices are UI-only, skipped).
    this.history = initialTranscript
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "expert" ? ("assistant" as const) : ("user" as const),
        content: m.text,
      }));
  }

  on<E extends keyof ExpertEvents>(event: E, handler: ExpertEvents[E]): () => void {
    this.handlers[event].add(handler);
    // Forward registrations to the fallback if we've already swapped.
    const offFallback = this.fallback?.on(event, handler);
    return () => {
      this.handlers[event].delete(handler);
      offFallback?.();
    };
  }

  private emit<E extends keyof ExpertEvents>(
    event: E,
    ...args: Parameters<ExpertEvents[E]>
  ): void {
    this.handlers[event].forEach((handler) =>
      (handler as (...a: Parameters<ExpertEvents[E]>) => void)(...args),
    );
  }

  private expertMessage(text: string): ChatMessage {
    return { id: crypto.randomUUID(), role: "expert", text, at: Date.now() };
  }

  private publishCursor(): void {
    this.emit("cursor", { stepIndex: this.stepIndex, awaiting: this.awaiting });
  }

  private setStatus(status: ConnectionStatus): void {
    this.emit("status", status);
  }

  /** Total user replies the scripted flow expects — our "done" threshold. */
  private get expectedReplies(): number {
    return this.script.steps.filter((s) => s.expectsUserReply).length;
  }

  connect(cursor?: ConversationCursor): void {
    if (this.started || this.disposed) return;
    this.started = true;
    this.setStatus("connecting");

    if (cursor) {
      this.stepIndex = cursor.stepIndex;
      this.awaiting = cursor.awaiting;
    }

    // Greeting is scripted — instant connection feel, no LLM latency.
    setTimeout(() => {
      if (this.disposed) return;
      this.setStatus("connected");
      if (cursor) {
        if (cursor.awaiting === "done") {
          this.emit("done");
        } else if (cursor.awaiting === "expert") {
          // Interrupted mid-expert-turn: re-ask so the chat can't stall.
          this.askViaLlm("Repeat or rephrase your pending question to the technician.");
          return;
        }
        this.publishCursor();
        return; // transcript already rendered by host; wait for user
      }
      this.emit("message", this.expertMessage(this.script.greeting));
      this.askViaLlm(
        "Greet briefly done — now ask your first scoping question for this job.",
      );
    }, 600);
  }

  send(text: string): void {
    if (this.disposed) return;
    if (this.fallback) {
      this.fallback.send(text);
      return;
    }
    this.history.push({ role: "user", content: text });
    this.stepIndex += 1;
    this.awaiting = "expert";
    this.publishCursor();
    this.askViaLlm(null);
  }

  /** Ask the LLM for the next expert turn; on any failure, hot-swap to mock. */
  private async askViaLlm(kickoff: string | null): Promise<void> {
    this.emit("typing", true);
    this.abort = new AbortController();
    try {
      const res = await fetch("/api/expert/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: this.abort.signal,
        body: JSON.stringify({
          phase: this.config.phase,
          equipment: this.config.equipment,
          severity: this.config.severity,
          exchange: this.stepIndex,
          expectedReplies: this.expectedReplies,
          kickoff,
          history: this.history,
        }),
      });
      if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }
      if (this.disposed) return;
      text = text.trim();
      if (!text) throw new Error("empty LLM reply");

      this.emit("typing", false);
      this.history.push({ role: "assistant", content: text });
      this.emit("message", this.expertMessage(text));

      if (this.stepIndex >= this.expectedReplies) {
        this.awaiting = "done";
        this.publishCursor();
        this.setStatus("done");
        this.emit("done");
      } else {
        this.awaiting = "user";
        this.publishCursor();
      }
    } catch (err) {
      if (this.disposed || (err instanceof DOMException && err.name === "AbortError")) return;
      this.emit("typing", false);
      this.swapToMock();
    }
  }

  /** LLM unreachable: continue the conversation with the scripted channel
   *  from the equivalent cursor position. Same events keep flowing. */
  private swapToMock(): void {
    const mock = new MockExpertChannel(this.script);
    this.fallback = mock;
    (Object.keys(this.handlers) as (keyof ExpertEvents)[]).forEach((event) => {
      this.handlers[event].forEach((handler) =>
        mock.on(event, handler as ExpertEvents[typeof event]),
      );
    });
    this.emit("message", {
      id: crypto.randomUUID(),
      role: "system",
      text: "Live AI unavailable — continuing with the scripted expert.",
      at: Date.now(),
    });
    mock.connect({ stepIndex: this.stepIndex, awaiting: "expert" });
  }

  simulatedLineFor(stepIndex: number): string | undefined {
    if (this.fallback) return this.fallback.simulatedLineFor(stepIndex);
    // Live stepIndex counts user exchanges — map to the nth reply-expecting
    // script step for a sensible canned line.
    const replySteps = this.script.steps.filter((s) => s.expectsUserReply);
    return replySteps[stepIndex]?.simulatedUserLine;
  }

  disconnect(): void {
    this.disposed = true;
    this.abort?.abort();
    this.fallback?.disconnect();
  }
}
