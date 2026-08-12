"use client";

/**
 * useExpertConnection — binds an ExpertConnection to React state.
 *
 * Owns: transcript, typing flag, connection status, cursor, and the
 * autosave side-effect (fire-and-forget PUT /api/session after each
 * exchange — see README's save-timing policy).
 *
 * Resume: `initial` (server-fetched persisted state) seeds the transcript
 * synchronously, and its cursor is handed to connect() so the channel
 * knows whether to re-ask the pending question or keep emitting.
 *
 * StrictMode: the effect's cleanup disconnects the channel (clearing all
 * its timers); a fresh channel is created on re-run, and connect() itself
 * is idempotent — dev double-mount produces no duplicate messages.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePageHideCleanup } from "./usePageHideCleanup";
import type { ChatMessage, ConversationCursor, ConversationState } from "@/lib/session-store";
import type { ConnectionStatus, ExpertConnection, ExpertPhase } from "@/lib/expert/types";
import { createConnection, type ExpertMode } from "@/lib/expert/create-connection";
import type { Equipment, Severity } from "@/lib/mission";

export interface UseExpertConnectionArgs {
  mode: ExpertMode;
  phase: ExpertPhase;
  equipment: Equipment;
  severity: Severity;
  /** Persisted state from the server page — resume seed. */
  initial: ConversationState | null;
}

export function useExpertConnection({
  mode,
  phase,
  equipment,
  severity,
  initial,
}: UseExpertConnectionArgs) {
  const [transcript, setTranscript] = useState<ChatMessage[]>(initial?.transcript ?? []);
  const [typing, setTyping] = useState(false);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [done, setDone] = useState(initial?.cursor.awaiting === "done");
  const [awaiting, setAwaiting] = useState<ConversationCursor["awaiting"]>(
    initial?.cursor.awaiting ?? "expert",
  );

  const connectionRef = useRef<ExpertConnection | null>(null);
  const cursorRef = useRef<ConversationCursor>(
    initial?.cursor ?? { stepIndex: 0, awaiting: "expert" },
  );
  const transcriptRef = useRef<ChatMessage[]>(transcript);

  // Terminal cleanup: React's effect cleanup does NOT run on tab close.
  // Disconnect the channel so the in-flight LLM fetch is aborted and mock
  // timers are cleared. Terminal-only (no `onHidden`): switching tabs must
  // not kill an in-progress conversation.
  usePageHideCleanup(() => connectionRef.current?.disconnect());

  /** Fire-and-forget autosave of {transcript, cursor} for this phase. */
  const save = useCallback(() => {
    const state: ConversationState = {
      transcript: transcriptRef.current,
      cursor: cursorRef.current,
    };
    fetch("/api/session", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [phase]: state }),
      keepalive: true,
    }).catch(() => {
      /* autosave is best-effort; next exchange retries */
    });
  }, [phase]);

  const append = useCallback(
    (message: ChatMessage) => {
      transcriptRef.current = [...transcriptRef.current, message];
      setTranscript(transcriptRef.current);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    let connection: ExpertConnection | null = null;
    const offs: (() => void)[] = [];

    createConnection({
      mode,
      phase,
      equipment,
      severity,
      initialTranscript: initial?.transcript,
    })
      .then((conn) => {
        if (cancelled) {
          conn.disconnect();
          return;
        }
        connection = conn;
        connectionRef.current = conn;

        offs.push(
          conn.on("message", (message) => {
            append(message);
            save();
          }),
          conn.on("typing", setTyping),
          conn.on("status", setStatus),
          conn.on("cursor", (cursor) => {
            cursorRef.current = cursor;
            setAwaiting(cursor.awaiting);
            save();
          }),
          conn.on("done", () => setDone(true)),
        );

        conn.connect(initial ? initial.cursor : undefined);
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      offs.forEach((off) => off());
      connection?.disconnect();
      connectionRef.current = null;
    };
    // Intentionally connect once per mount: `initial` is a server snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, phase, equipment, severity]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !connectionRef.current) return;
      append({ id: crypto.randomUUID(), role: "user", text: trimmed, at: Date.now() });
      save();
      connectionRef.current.send(trimmed);
    },
    [append, save],
  );

  /** Chat input enabled only while the expert is actually waiting on the
   *  user — not merely between two expert messages (typing=false there). */
  const canSend = status === "connected" && !typing && !done && awaiting === "user";

  /** Pre-canned technician line for the current step (Simulate-speech bonus). */
  const getSimulatedLine = useCallback(
    () => connectionRef.current?.simulatedLineFor(cursorRef.current.stepIndex),
    [],
  );

  return { transcript, typing, status, done, sendMessage, canSend, getSimulatedLine };
}
