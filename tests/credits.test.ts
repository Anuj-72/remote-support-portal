/**
 * Unit tests for the credits ledger (PLAN §9).
 *
 * The store is file-backed and reads its directory at module load, so the
 * env vars below are set BEFORE the dynamic import: CREDITS_DATA_DIR points
 * the ledger at a throwaway temp directory (never .data/), and
 * DEMO_USER_BALANCE pins the seed. node:test runs each file in its own
 * process, so nothing here leaks into the running app.
 *
 * What's covered — the guarantees PLAN §4.4 exists to defend:
 * - seeding, successful deduction, insufficient balance
 * - ref idempotency (retry of the same charge is a no-op)
 * - independent refs charge independently
 * - the atomic one-mission-per-account guard (activeMission) + its
 *   staleness self-heal
 * - clearActiveMission frees the account
 * - invalid uid is denied (path-traversal guard)
 */

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = mkdtempSync(path.join(os.tmpdir(), "credits-test-"));
process.env.CREDITS_DATA_DIR = tmpDir;
process.env.DEMO_USER_BALANCE = "250";

const credits = await import("../lib/credits-store.ts");
const {
  chargeCredits,
  clearActiveMission,
  getBalance,
  readAccount,
  rollbackCharge,
  MISSION_COST,
} = credits;

after(() => rmSync(tmpDir, { recursive: true, force: true }));

/** Unique, valid-UUID-shaped ids so tests never share state. */
let counter = 0;
function freshUid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, "0")}`;
}

test("a new account is seeded with the DEMO_USER_BALANCE", () => {
  const uid = freshUid();
  assert.equal(getBalance(uid), 250);
});

test("a 100-credit charge succeeds and deducts exactly 100", () => {
  const uid = freshUid();
  const result = chargeCredits(uid, MISSION_COST, "ref-1");
  assert.deepEqual(result, { ok: true, balance: 150 });
  assert.equal(getBalance(uid), 150);
});

test("a charge that would exceed the balance is rejected and leaves it untouched", () => {
  const uid = freshUid(); // 250
  chargeCredits(uid, MISSION_COST, "ref-1"); // 150
  const result = chargeCredits(uid, 300, "ref-2");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "insufficient_balance");
  assert.equal(getBalance(uid), 150);
});

test("recharging the same ref is a no-op (idempotency)", () => {
  const uid = freshUid();
  assert.equal(chargeCredits(uid, MISSION_COST, "ref-1").ok, true);
  const retry = chargeCredits(uid, MISSION_COST, "ref-1");
  assert.equal(retry.ok, false);
  if (!retry.ok) assert.equal(retry.reason, "already_charged");
  assert.equal(getBalance(uid), 150); // charged exactly once
});

test("different refs charge independently", () => {
  const uid = freshUid();
  chargeCredits(uid, MISSION_COST, "ref-1");
  chargeCredits(uid, MISSION_COST, "ref-2");
  assert.equal(getBalance(uid), 50);
  assert.ok(readAccount(uid)?.chargedRefs.includes("ref-1"));
  assert.ok(readAccount(uid)?.chargedRefs.includes("ref-2"));
});

test("an active mission blocks a second charge (atomic one-mission guard)", () => {
  const uid = freshUid();
  const first = chargeCredits(uid, MISSION_COST, "ref-1", {
    sid: "mission-1",
    startedAt: Date.now(),
  });
  assert.equal(first.ok, true);

  const second = chargeCredits(uid, MISSION_COST, "ref-2", {
    sid: "mission-2",
    startedAt: Date.now(),
  });
  assert.equal(second.ok, false);
  if (!second.ok) assert.equal(second.reason, "mission_in_progress");
  assert.equal(getBalance(uid), 150); // only the first charge deducted
});

test("a stale activeMission (abandoned, cookie lapsed) is replaced, not blocked", () => {
  const uid = freshUid();
  chargeCredits(uid, MISSION_COST, "ref-1", {
    sid: "mission-1",
    startedAt: Date.now() - 6 * 60 * 60 * 1000, // older than the 5h staleness window
  });

  const second = chargeCredits(uid, MISSION_COST, "ref-2", {
    sid: "mission-2",
    startedAt: Date.now(),
  });
  assert.equal(second.ok, true);
  assert.equal(readAccount(uid)?.activeMission?.sid, "mission-2");
});

test("clearActiveMission frees the account for a new paid mission", () => {
  const uid = freshUid();
  chargeCredits(uid, MISSION_COST, "ref-1", { sid: "mission-1", startedAt: Date.now() });
  clearActiveMission(uid);
  assert.equal(readAccount(uid)?.activeMission, undefined);

  const next = chargeCredits(uid, MISSION_COST, "ref-2", {
    sid: "mission-2",
    startedAt: Date.now(),
  });
  assert.equal(next.ok, true);
});

test("rollbackCharge undoes a charge whose mission could not be created", () => {
  const uid = freshUid();
  chargeCredits(uid, MISSION_COST, "ref-1", { sid: "ref-1", startedAt: Date.now() });
  assert.equal(getBalance(uid), 150);

  rollbackCharge(uid, "ref-1", MISSION_COST);

  assert.equal(getBalance(uid), 250);
  assert.equal(readAccount(uid)?.activeMission, undefined);
  assert.equal(readAccount(uid)?.chargedRefs.includes("ref-1"), false);
});

test("an invalid uid is denied — the path-traversal guard", () => {
  const result = chargeCredits("../etc/passwd", MISSION_COST, "ref-1");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "insufficient_balance");
});
