import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { MISSION_COOKIE, parseMission } from "@/lib/mission";
import { readSession, updateSession, type SessionData } from "@/lib/session-store";

/**
 * GET/PUT /api/session — autosave endpoint for the *data* tier.
 *
 * Route Handler (not a Server Action) on purpose:
 * - PUT is fire-and-forget from the chat autosave (no UI transition wanted)
 * - navigator.sendBeacon (600s expiry flush) can only hit a URL, not
 *   invoke an action.
 *
 * The sid comes from the httpOnly cookie, never from the request body —
 * a client can only ever write to its own session.
 */

async function getSid(): Promise<string | null> {
  const store = await cookies();
  return parseMission(store.get(MISSION_COOKIE)?.value)?.sid ?? null;
}

export async function GET() {
  const sid = await getSid();
  if (!sid) return NextResponse.json({ error: "No active mission" }, { status: 401 });
  const session = await readSession(sid);
  return NextResponse.json(session ?? { sid });
}

export async function PUT(request: Request) {
  const sid = await getSid();
  if (!sid) return NextResponse.json({ error: "No active mission" }, { status: 401 });

  // Lenient parse: sendBeacon may arrive as text/plain (string beacons) or
  // application/json (Blob beacons) — parse the raw text regardless.
  let patch: Partial<SessionData>;
  try {
    patch = JSON.parse(await request.text());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Whitelist fields — sid and server-owned timestamps are not writable.
  const { scoping, qa, recorded } = patch;
  await updateSession(sid, {
    ...(scoping !== undefined && { scoping }),
    ...(qa !== undefined && { qa }),
    ...(recorded !== undefined && { recorded }),
  });

  return NextResponse.json({ ok: true });
}
