/**
 * Route protection (Next 16: "Proxy", formerly Middleware).
 *
 * Two responsibilities, in this exact order:
 *
 * 1. **Mint the `user` identity cookie — unconditionally, FIRST.** This is
 *    the only layer that runs before every request, and Server Components
 *    cannot set cookies — so `/` (which has no required stage and used to
 *    exit early) must still get a uid, or the balance read on a first
 *    visit would come back empty. The cookie is written to BOTH the
 *    forwarded `request.cookies` (so this same request's Server Components
 *    see it) AND the response's `res.cookies` (so the browser stores it) —
 *    a cookie set only on the outgoing response is invisible to the request
 *    that produced it. Mint-once: no-op when the cookie already exists.
 *
 * 2. **Stage gate (unchanged logic):** each protected route requires a
 *    MINIMUM stage, compared ordinally via hasReached — never equality,
 *    otherwise refreshing /activity at stage=scoping_done would bounce.
 *    Insufficient or malformed mission cookie → redirect "/".
 *
 * Every branch that continues the request returns the SAME `response`
 * object created up front — a fresh NextResponse.next() after minting
 * would silently drop the cookie we just configured.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { MISSION_COOKIE, hasReached, parseMission, type Stage } from "@/lib/mission";
import { USER_COOKIE, mintUser, parseUser, serializeUser } from "@/lib/user";

const REQUIRED_STAGE: Record<string, Stage> = {
  "/prep": "configured",
  "/activity": "prepped",
  "/analysis": "finished",
};

const USER_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365, // stable identity: outlive any single mission
};

export function proxy(request: NextRequest) {
  // 1. User identity — mint unconditionally, before any route logic.
  const response = NextResponse.next();
  if (!parseUser(request.cookies.get(USER_COOKIE)?.value)) {
    const user = mintUser();
    const value = serializeUser(user);
    // Note: the forwarded request's cookie API only takes the options-object
    // form; the response's cookie API takes (name, value, options).
    request.cookies.set({ name: USER_COOKIE, value, ...USER_COOKIE_OPTIONS });
    response.cookies.set(USER_COOKIE, value, USER_COOKIE_OPTIONS);
  }

  // 2. Stage gate — return the same response object on every continue branch.
  const required = REQUIRED_STAGE[request.nextUrl.pathname];
  if (!required) return response;

  const mission = parseMission(request.cookies.get(MISSION_COOKIE)?.value);
  if (!mission || !hasReached(mission.stage, required)) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return response;
}

export const config = {
  // All non-static routes — the uid must exist before any page renders.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
