"use server";

/**
 * Server Actions — the ONLY write path for the `mission` cookie.
 *
 * Why Actions (not Route Handlers) for these mutations: they are
 * UI-driven state transitions (form submit / button click) that need
 * cookie mutation + redirect + RSC refresh in one round trip, with
 * useFormStatus / useTransition pending states for free.
 *
 * Billing (PLAN): startMission is also the only write path for the credit
 * charge — the 100-credit deduction happens here, atomically and
 * idempotently, the moment the process starts. It is never refunded:
 * finishJob / expireMission / resetMission only clear the account's
 * activeMission so a new mission can be paid for.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  EQUIPMENT_TYPES,
  MISSION_COOKIE,
  SEVERITY_LEVELS,
  STAGE_ORDER,
  hasReached,
  parseMission,
  serializeMission,
  type Equipment,
  type Mission,
  type Severity,
  type Stage,
} from "@/lib/mission";
import { USER_COOKIE, parseUser } from "@/lib/user";
import {
  MISSION_COST,
  chargeCredits,
  clearActiveMission,
  getBalance,
  rollbackCharge,
} from "@/lib/credits-store";
import { createSession, updateSession } from "@/lib/session-store";

/**
 * Result contract for the Phase 1 form (useActionState). Success never
 * returns — the action redirects to /prep.
 */
export type StartMissionResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_selection" | "mission_in_progress" | "insufficient_balance";
      balance: number;
    };

async function getMission(): Promise<Mission | null> {
  const store = await cookies();
  return parseMission(store.get(MISSION_COOKIE)?.value);
}

async function setMission(mission: Mission): Promise<void> {
  const store = await cookies();
  store.set(MISSION_COOKIE, serializeMission(mission), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 4, // long enough for any demo run
  });
}

/** The `user` cookie is minted by proxy.ts — actions only read it. */
async function getUid(): Promise<string | null> {
  const store = await cookies();
  return parseUser(store.get(USER_COOKIE)?.value)?.uid ?? null;
}

/** A mission is "in progress" while its cookie stage is before `finished`. */
function isInProgress(mission: Mission): boolean {
  return !hasReached(mission.stage, "finished");
}

/** Advance stage monotonically — never allow an action to move backwards. */
async function advanceStage(mission: Mission, to: Stage): Promise<Mission> {
  if (hasReached(mission.stage, to)) return mission; // idempotent (double submit)
  const next = { ...mission, stage: to };
  await setMission(next);
  return next;
}

/**
 * Phase 1 form submit: guard → charge → mint sid → set cookie → seed session.
 *
 * The charge is the authoritative write and happens BEFORE anything is
 * created — a failed charge leaves no mission cookie and no session file.
 */
export async function startMission(
  _prev: StartMissionResult | null,
  formData: FormData,
): Promise<StartMissionResult> {
  const equipment = formData.get("equipment");
  const severity = formData.get("severity");
  if (
    !EQUIPMENT_TYPES.includes(equipment as Equipment) ||
    !SEVERITY_LEVELS.includes(severity as Severity)
  ) {
    return { ok: false, reason: "invalid_selection", balance: 0 };
  }

  const uid = await getUid();
  if (!uid) {
    // Unreachable in practice (the proxy mints the cookie on every request) —
    // kept as a defensive fail-closed: never charge a user we can't identify.
    return { ok: false, reason: "mission_in_progress", balance: 0 };
  }

  // Fast-path UX guard: a live mission cookie means one mission per browser.
  // The authoritative, race-proof guard is account.activeMission inside the
  // synchronous charge — this check only avoids minting a sid needlessly.
  const existing = await getMission();
  if (existing && isInProgress(existing)) {
    return { ok: false, reason: "mission_in_progress", balance: getBalance(uid) };
  }

  const mission: Mission = {
    sid: crypto.randomUUID(),
    stage: "configured",
    equipment: equipment as Equipment,
    severity: severity as Severity,
  };

  // The single authoritative billing write: 100 credits, atomically, keyed
  // by this mission's sid. Also records the mission as the account's active
  // (paid) mission — the billing gate on /api/expert/chat checks it.
  const charged = chargeCredits(uid, MISSION_COST, mission.sid, {
    sid: mission.sid,
    startedAt: Date.now(),
  });
  if (!charged.ok) {
    return {
      ok: false,
      reason:
        charged.reason === "insufficient_balance" ? "insufficient_balance" : "mission_in_progress",
      balance: charged.balance,
    };
  }

  await setMission(mission);
  try {
    await createSession(mission.sid);
  } catch {
    // Failure atomicity: the charge already happened — roll it back so a
    // failed session seed leaves no trace and no spent credits. (Nearly
    // unreachable: the cookie set is in-memory and the session write is a
    // local fs write, but the guard keeps "no partial state" symmetric.)
    rollbackCharge(uid, mission.sid, MISSION_COST);
    const store = await cookies();
    store.delete(MISSION_COOKIE);
    return { ok: false, reason: "mission_in_progress", balance: getBalance(uid) };
  }
  redirect("/prep");
}

/** Phase 2 countdown finished or skipped. */
export async function markPrepped(): Promise<void> {
  const mission = await getMission();
  if (!mission) redirect("/");
  await advanceStage(mission, "prepped");
  redirect("/activity");
}

/**
 * Tab N "Completed → Next": the *authorization* write that unlocks the next
 * tab. revalidatePath makes the same action round trip return a fresh RSC
 * payload for /activity, so the server-derived `unlockedTab` prop updates
 * without a desync between cookie and UI.
 */
export async function completeTab(tab: 1 | 2 | 3): Promise<void> {
  const mission = await getMission();
  if (!mission) redirect("/");
  const target: Stage = tab === 1 ? "scoping_done" : tab === 2 ? "recording_done" : "qa_done";
  // Guard: cannot complete tab N without having reached the stage before it.
  const requiredIndex = STAGE_ORDER.indexOf(target) - 1;
  if (!hasReached(mission.stage, STAGE_ORDER[requiredIndex])) return;
  await advanceStage(mission, target);
  revalidatePath("/activity");
}

/** "Finish Job" on Tab 3 → /analysis. The paid mission ends; the account is
 *  freed for the next one (no refund — the charge was already spent). */
export async function finishJob(): Promise<void> {
  const mission = await getMission();
  if (!mission) redirect("/");
  await advanceStage(mission, "finished");
  await updateSession(mission.sid, { finishedAt: Date.now() });
  await clearActiveMissionForUser();
  redirect("/analysis");
}

/** 600s activity timer expired: mark finished (data already saved via
 *  sendBeacon) and let the client navigate to /analysis. */
export async function expireMission(): Promise<void> {
  const mission = await getMission();
  if (!mission) redirect("/");
  await advanceStage(mission, "finished");
  await updateSession(mission.sid, { expiredAt: Date.now() });
  await clearActiveMissionForUser();
  redirect("/analysis");
}

/** Start over from /analysis (or anywhere): clear cookie, back to Phase 1.
 *  Also clears the active paid mission — no refund, by design. */
export async function resetMission(): Promise<void> {
  await clearActiveMissionForUser();
  const store = await cookies();
  store.delete(MISSION_COOKIE);
  redirect("/");
}

/** Clear the account's activeMission so the LLM billing gate stops
 *  authorizing a finished / expired / abandoned mission. */
async function clearActiveMissionForUser(): Promise<void> {
  const uid = await getUid();
  if (uid) clearActiveMission(uid);
}
