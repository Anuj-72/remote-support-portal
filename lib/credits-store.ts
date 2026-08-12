/**
 * File-backed credits ledger — the *billing* tier.
 *
 * Stores each user's balance, the refs of already-charged missions
 * (idempotency), and the currently active paid mission. Same seam pattern
 * as lib/session-store.ts: swap these functions for a Redis/Postgres
 * implementation in production without touching callers.
 *
 * ⚠ Atomicity — why synchronous fs (PLAN §4.4): chargeCredits performs a
 * read → check → write with fs.readFileSync / fs.writeFileSync. There is NO
 * await boundary between them, so in Node's single-threaded event loop two
 * concurrent calls cannot interleave: a double-click on Start, a Server
 * Action retry, or two tabs racing before the mission cookie exists all
 * execute serially, and the second caller observes the first caller's
 * deduction. This guarantee is per-process only; multi-instance deployments
 * must use the DB equivalent — a single `UPDATE ... WHERE balance >= amount`
 * statement plus a UNIQUE (uid, ref) charge row (PLAN §4.4).
 */

import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

/** The price of a mission, charged the moment the process starts. */
export const MISSION_COST = 100;

/**
 * An activeMission older than this is treated as stale (abandoned). Matches
 * the mission cookie's 4h maxAge (actions/mission.ts) exactly, so the guard
 * releases at the same moment the cookie does — there is never a dead window
 * where the user has neither a mission cookie nor a stale activeMission but
 * is still blocked from starting a new one.
 */
const STALE_ACTIVE_MISSION_MS = 4 * 60 * 60 * 1000;

/** Overridable for tests (the app always uses .data/credits). */
const DATA_DIR = process.env.CREDITS_DATA_DIR ?? path.join(process.cwd(), ".data", "credits");

const SEED_PARSE = Number(process.env.DEMO_USER_BALANCE);
const SEED_BALANCE = Number.isFinite(SEED_PARSE) ? Math.max(0, SEED_PARSE) : 300;

export interface CreditsAccount {
  uid: string;
  balance: number;
  /** Mission sids already charged — the idempotency ledger. */
  chargedRefs: string[];
  /** The paid mission currently in progress (the LLM route's billing gate). */
  activeMission?: { sid: string; startedAt: number };
}

export type ChargeResult =
  | { ok: true; balance: number }
  | {
      ok: false;
      reason: "insufficient_balance" | "already_charged" | "mission_in_progress";
      balance: number;
    };

/** UUID only — the uid becomes a filesystem path segment. Mirrors the guard
 *  in session-store.ts; kept local so this module is self-contained. */
function isSafeUid(uid: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(uid);
}

function fileFor(uid: string): string {
  return path.join(DATA_DIR, `${uid}.json`);
}

function writeAccount(account: CreditsAccount): void {
  if (!isSafeUid(account.uid)) return;
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(fileFor(account.uid), JSON.stringify(account, null, 2), "utf8");
}

export function readAccount(uid: string): CreditsAccount | null {
  if (!isSafeUid(uid)) return null;
  try {
    const raw = readFileSync(fileFor(uid), "utf8");
    const parsed = JSON.parse(raw) as CreditsAccount;
    if (
      typeof parsed.uid !== "string" ||
      typeof parsed.balance !== "number" ||
      !Array.isArray(parsed.chargedRefs)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Create the account with the seeded balance if absent (idempotent). */
export function ensureAccount(uid: string): CreditsAccount {
  const existing = readAccount(uid);
  if (existing) return existing;
  const account: CreditsAccount = { uid, balance: SEED_BALANCE, chargedRefs: [] };
  writeAccount(account);
  return account;
}

/** Convenience read for server-rendered UI (seeds the account on first use). */
export function getBalance(uid: string): number {
  return ensureAccount(uid).balance;
}

/**
 * Atomic + idempotent deduction. One synchronous read → check → write (see
 * the module docstring for why that is race-free within this process).
 *
 * - `ref` idempotency: a retried charge for the same mission is a no-op.
 * - `activeMission` (optional, set by startMission): the authoritative
 *   one-mission-per-account guard — a second charge while one is active is
 *   rejected *inside* the same write, so two racing starts can't both win.
 *   A stale activeMission (abandoned, cookie lapsed) is replaced.
 */
export function chargeCredits(
  uid: string,
  amount: number,
  ref: string,
  activeMission?: { sid: string; startedAt: number },
): ChargeResult {
  if (!isSafeUid(uid) || amount <= 0) {
    return { ok: false, reason: "insufficient_balance", balance: 0 };
  }
  const account = ensureAccount(uid);

  if (account.chargedRefs.includes(ref)) {
    return { ok: false, reason: "already_charged", balance: account.balance };
  }

  const active = account.activeMission;
  if (active && Date.now() - active.startedAt < STALE_ACTIVE_MISSION_MS) {
    return { ok: false, reason: "mission_in_progress", balance: account.balance };
  }

  if (account.balance < amount) {
    return { ok: false, reason: "insufficient_balance", balance: account.balance };
  }

  account.balance -= amount;
  account.chargedRefs.push(ref);
  if (activeMission) account.activeMission = activeMission;
  writeAccount(account);
  return { ok: true, balance: account.balance };
}

/**
 * Internal atomicity rollback (NOT a user-facing refund — there are no
 * refunds in this product). Undoes a charge whose mission could not be
 * created (e.g. the session seed failed), so a failed start leaves no trace:
 * balance restored, ref removed, activeMission cleared. Same synchronous
 * single-write discipline as chargeCredits.
 */
export function rollbackCharge(uid: string, ref: string, amount: number): void {
  if (!isSafeUid(uid)) return;
  const account = readAccount(uid);
  if (!account) return;
  const idx = account.chargedRefs.indexOf(ref);
  if (idx === -1) return;
  account.chargedRefs.splice(idx, 1);
  account.balance += amount;
  if (account.activeMission?.sid === ref) delete account.activeMission;
  writeAccount(account);
}

/** Mission finished / expired / abandoned: the account is free for a new
 *  paid mission, and the LLM route's billing gate stops authorizing it. */
export function clearActiveMission(uid: string): void {
  if (!isSafeUid(uid)) return;
  const account = readAccount(uid);
  if (!account?.activeMission) return;
  delete account.activeMission;
  writeAccount(account);
}
