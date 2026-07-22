/**
 * File-backed session store — the *data* tier, mimicking a database.
 *
 * Stores per-session chat transcripts, conversation cursors and the
 * recording flag under .data/sessions/<sid>.json.
 *
 * ⚠ Local-dev only: serverless filesystems are read-only. This module is
 * deliberately a thin interface — swap the four exported functions for a
 * Redis/Postgres implementation in production without touching callers.
 */

import { promises as fs } from "fs";
import path from "path";

export type ChatRole = "expert" | "user" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  text: string;
  at: number; // epoch ms
}

export interface ConversationCursor {
  stepIndex: number;
  awaiting: "expert" | "user" | "done";
}

export interface ConversationState {
  transcript: ChatMessage[];
  cursor: ConversationCursor;
}

export interface SessionData {
  sid: string;
  scoping?: ConversationState;
  qa?: ConversationState;
  recorded?: boolean;
  expiredAt?: number;
  finishedAt?: number;
}

const DATA_DIR = path.join(process.cwd(), ".data", "sessions");

/** sid comes from a cookie the client could tamper — never let it become
 *  a path traversal. UUIDs only. */
function isSafeSid(sid: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(sid);
}

function fileFor(sid: string): string {
  return path.join(DATA_DIR, `${sid}.json`);
}

export async function readSession(sid: string): Promise<SessionData | null> {
  if (!isSafeSid(sid)) return null;
  try {
    const raw = await fs.readFile(fileFor(sid), "utf8");
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function writeSession(data: SessionData): Promise<void> {
  if (!isSafeSid(data.sid)) return;
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(fileFor(data.sid), JSON.stringify(data, null, 2), "utf8");
}

/** Shallow-merge a partial update into the stored session. */
export async function updateSession(
  sid: string,
  patch: Partial<Omit<SessionData, "sid">>,
): Promise<SessionData | null> {
  if (!isSafeSid(sid)) return null;
  const current = (await readSession(sid)) ?? { sid };
  const next: SessionData = { ...current, ...patch, sid };
  await writeSession(next);
  return next;
}

export async function createSession(sid: string): Promise<void> {
  await writeSession({ sid });
}
