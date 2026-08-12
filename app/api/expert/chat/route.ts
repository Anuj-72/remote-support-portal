import { streamText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  EQUIPMENT_TYPES,
  MISSION_COOKIE,
  SEVERITY_LEVELS,
  parseMission,
  type Equipment,
  type Severity,
} from "@/lib/mission";
import { USER_COOKIE, parseUser } from "@/lib/user";
import { readAccount } from "@/lib/credits-store";

/**
 * POST /api/expert/chat — live LLM expert replies (optional mode).
 *
 * Route Handler (not a Server Action) on purpose: streaming needs
 * ownership of the Response object; Actions can't return a stream.
 *
 * Hardening (PLAN §5.2):
 * - **Billing gate:** identity comes from cookies, never the request body
 *   (the same rule /api/session follows). An LLM call is allowed only for
 *   the single paid, active mission — curl / devtools / expired-session
 *   calls get 401. Once missions cost credits this endpoint is a paid
 *   resource; the gate prevents free-inference abuse of the Groq tokens.
 * - **abortSignal:** the stream is explicitly tied to request.signal, so a
 *   client disconnect cancels the provider call immediately — no zombie
 *   token generation, no wasted LLM billing (the server-resource answer).
 * - **Runtime validation:** the body is typed but untrusted; allowlists and
 *   caps stop a hostile client from growing the prompt unboundedly.
 */

export const runtime = "nodejs";

const MAX_HISTORY_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_KICKOFF_LENGTH = 500;
const MAX_EXCHANGE = 30;

interface ChatBody {
  phase: "scoping" | "qa";
  equipment: string;
  severity: string;
  exchange: number;
  expectedReplies: number;
  kickoff: string | null;
  history: { role: "user" | "assistant"; content: string }[];
}

function systemPrompt(body: ChatBody): string {
  const phaseBrief =
    body.phase === "scoping"
      ? "You are scoping the problem BEFORE any repair: ask focused diagnostic questions about symptoms, readings, and visible state."
      : "You have just reviewed the technician's diagnostic video. Verify findings and close out the job with clear next steps.";
  return [
    `You are Sam, a senior remote support engineer guiding a field technician working on a ${body.equipment} (${body.severity}).`,
    phaseBrief,
    `This conversation allows ${body.expectedReplies} technician replies total; ${body.exchange} have happened. When the final reply arrives, wrap up decisively and tell them to complete this step.`,
    "Stay in character. Be concise: 1-3 sentences per message. Ask ONE question at a time. Never mention being an AI.",
  ].join(" ");
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Live mode not configured" }, { status: 503 });
  }

  // ── Billing gate: the caller must own the active paid mission. ─────────
  const store = await cookies();
  const mission = parseMission(store.get(MISSION_COOKIE)?.value);
  const user = parseUser(store.get(USER_COOKIE)?.value);
  if (!mission || !user) {
    return NextResponse.json({ error: "No active mission" }, { status: 401 });
  }
  const account = readAccount(user.uid);
  if (!account || account.activeMission?.sid !== mission.sid) {
    return NextResponse.json({ error: "No active paid mission" }, { status: 401 });
  }

  let body: ChatBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Runtime validation — typed but untrusted. ─────────────────────────
  if (
    (body.phase !== "scoping" && body.phase !== "qa") ||
    !EQUIPMENT_TYPES.includes(body.equipment as Equipment) ||
    !SEVERITY_LEVELS.includes(body.severity as Severity)
  ) {
    return NextResponse.json({ error: "Invalid script parameters" }, { status: 400 });
  }
  if (
    !Number.isInteger(body.exchange) ||
    body.exchange < 0 ||
    body.exchange > MAX_EXCHANGE ||
    !Number.isInteger(body.expectedReplies) ||
    body.expectedReplies < 1 ||
    body.expectedReplies > MAX_EXCHANGE
  ) {
    return NextResponse.json({ error: "Invalid exchange counters" }, { status: 400 });
  }
  if (!Array.isArray(body.history) || body.history.length > MAX_HISTORY_MESSAGES) {
    return NextResponse.json({ error: "History too large" }, { status: 400 });
  }
  if (
    body.history.some(
      (message) =>
        (message.role !== "user" && message.role !== "assistant") ||
        typeof message.content !== "string" ||
        message.content.length > MAX_MESSAGE_LENGTH,
    )
  ) {
    return NextResponse.json({ error: "Invalid history message" }, { status: 400 });
  }
  if (
    (body.kickoff !== null && typeof body.kickoff !== "string") ||
    (typeof body.kickoff === "string" && body.kickoff.length > MAX_KICKOFF_LENGTH)
  ) {
    return NextResponse.json({ error: "Invalid kickoff" }, { status: 400 });
  }
  // The conversation must belong to the paid job (bonus consistency check).
  if (body.equipment !== mission.equipment || body.severity !== mission.severity) {
    return NextResponse.json({ error: "Mission mismatch" }, { status: 400 });
  }

  const groq = createGroq({ apiKey });

  try {
    const result = streamText({
      model: groq(process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile"),
      system: systemPrompt(body),
      messages: [
        ...body.history,
        ...(body.kickoff ? [{ role: "user" as const, content: `[system] ${body.kickoff}` }] : []),
      ],
      // Client disconnected? request.signal fires → the Groq call is
      // cancelled immediately. No orphaned server-side stream.
      abortSignal: request.signal,
    });
    return result.toTextStreamResponse();
  } catch {
    return NextResponse.json({ error: "LLM request failed" }, { status: 502 });
  }
}
