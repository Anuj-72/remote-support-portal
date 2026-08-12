/**
 * User identity — the `user` cookie.
 *
 * The uid is the stable identity the credits ledger is keyed by. It is
 * minted exactly once per browser, by proxy.ts — the only layer that runs
 * before every request (Server Components cannot set cookies, and `/` must
 * be able to render a balance on a first visit with no mission). Everything
 * else — pages, Server Actions, route handlers — only *reads* it.
 *
 * Same lenient-parse philosophy as lib/mission.ts: a missing or malformed
 * cookie parses to null and is treated as "no user" by every reader. The
 * documented production hardening (HMAC/JWT signing, see README) slots in
 * here and in mission.ts at the same seam.
 */

export interface User {
  uid: string;
}

export const USER_COOKIE = "user";

/** UUID only — the uid becomes a filesystem path segment in the ledger. */
export function isSafeUid(uid: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(uid);
}

export function mintUser(): User {
  return { uid: crypto.randomUUID() };
}

export function serializeUser(user: User): string {
  return JSON.stringify(user);
}

/** Lenient parse: malformed / hand-edited cookie → null → "no user". */
export function parseUser(raw: string | undefined): User | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (typeof data.uid !== "string" || !isSafeUid(data.uid)) return null;
    return data as User;
  } catch {
    return null;
  }
}
