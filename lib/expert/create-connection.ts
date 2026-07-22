"use client";

/**
 * Factory: builds the right ExpertConnection for the current mode.
 * Mode is decided SERVER-side (env key presence) and passed down as a
 * prop — the client never sees the API key, only the resulting mode.
 */

import type { Equipment, Severity } from "@/lib/mission";
import type { ChatMessage } from "@/lib/session-store";
import type { ExpertConnection, ExpertPhase, ExpertScript } from "./types";
import { MockExpertChannel } from "./mock-channel";
import { LiveExpertChannel } from "./live-channel";

export type ExpertMode = "mock" | "live";

export interface ConnectionConfig {
  mode: ExpertMode;
  phase: ExpertPhase;
  equipment: Equipment;
  severity: Severity;
  /** Persisted transcript — live mode rebuilds its LLM history from it
   *  on resume (the mock channel needs only the cursor). */
  initialTranscript?: ChatMessage[];
}

async function fetchScript(config: ConnectionConfig): Promise<ExpertScript> {
  const params = new URLSearchParams({
    phase: config.phase,
    equipment: config.equipment,
    severity: config.severity,
  });
  const res = await fetch(`/api/expert/script?${params}`);
  if (!res.ok) throw new Error(`Script fetch failed: ${res.status}`);
  return res.json();
}

export async function createConnection(config: ConnectionConfig): Promise<ExpertConnection> {
  // The scripted flow is always fetched — live mode uses it as the
  // conversation skeleton and falls back to it wholesale on LLM failure.
  const script = await fetchScript(config);
  if (config.mode === "live") {
    return new LiveExpertChannel(script, config, config.initialTranscript ?? []);
  }
  return new MockExpertChannel(script);
}
