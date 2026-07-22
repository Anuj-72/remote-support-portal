import { streamText } from "ai";
import { createGroq } from "@ai-sdk/groq";
import { NextResponse } from "next/server";

/**
 * POST /api/expert/chat — live LLM expert replies (optional mode).
 *
 * Route Handler (not a Server Action) on purpose: streaming needs
 * ownership of the Response object; Actions can't return a stream.
 *
 * No GROQ_API_KEY → 503, and the client channel hot-swaps to the
 * scripted mock. The key lives only here, server-side.
 */

export const runtime = "nodejs";

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

  let body: ChatBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
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
    });
    return result.toTextStreamResponse();
  } catch {
    return NextResponse.json({ error: "LLM request failed" }, { status: 502 });
  }
}
