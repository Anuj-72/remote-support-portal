/**
 * Route protection (Next 16: "Proxy", formerly Middleware).
 *
 * Each protected route requires a MINIMUM stage, compared ordinally via
 * hasReached — never equality, otherwise refreshing /activity at
 * stage=scoping_done would bounce. Deep-linking without sufficient stage
 * redirects to "/" server-side, before any page code runs.
 *
 * Pages re-check the cookie themselves (defense in depth) — proxy is the
 * optimistic first gate, not the only one.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { MISSION_COOKIE, hasReached, parseMission, type Stage } from "@/lib/mission";

const REQUIRED_STAGE: Record<string, Stage> = {
  "/prep": "configured",
  "/activity": "prepped",
  "/analysis": "finished",
};

export function proxy(request: NextRequest) {
  const required = REQUIRED_STAGE[request.nextUrl.pathname];
  if (!required) return NextResponse.next();

  const mission = parseMission(request.cookies.get(MISSION_COOKIE)?.value);
  if (!mission || !hasReached(mission.stage, required)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/prep", "/activity", "/analysis"],
};
