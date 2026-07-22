"use server";

/**
 * Server Actions — the ONLY write path for the `mission` cookie.
 *
 * Why Actions (not Route Handlers) for these mutations: they are
 * UI-driven state transitions (form submit / button click) that need
 * cookie mutation + redirect + RSC refresh in one round trip, with
 * useFormStatus / useTransition pending states for free.
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
import { createSession, updateSession } from "@/lib/session-store";

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

/** Advance stage monotonically — never allow an action to move backwards. */
async function advanceStage(mission: Mission, to: Stage): Promise<Mission> {
  if (hasReached(mission.stage, to)) return mission; // idempotent (double submit)
  const next = { ...mission, stage: to };
  await setMission(next);
  return next;
}

/** Phase 1 form submit: mint sid, set cookie, seed session file, go to /prep. */
export async function startMission(formData: FormData): Promise<void> {
  const equipment = formData.get("equipment");
  const severity = formData.get("severity");
  if (
    !EQUIPMENT_TYPES.includes(equipment as Equipment) ||
    !SEVERITY_LEVELS.includes(severity as Severity)
  ) {
    // Progressive-enhancement path (JS off): invalid submit just returns home.
    redirect("/");
  }

  const mission: Mission = {
    sid: crypto.randomUUID(),
    stage: "configured",
    equipment: equipment as Equipment,
    severity: severity as Severity,
  };
  await setMission(mission);
  await createSession(mission.sid);
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

/** "Finish Job" on Tab 3 → /analysis. */
export async function finishJob(): Promise<void> {
  const mission = await getMission();
  if (!mission) redirect("/");
  await advanceStage(mission, "finished");
  await updateSession(mission.sid, { finishedAt: Date.now() });
  redirect("/analysis");
}

/** 600s activity timer expired: mark finished (data already saved via
 *  sendBeacon) and let the client navigate to /analysis. */
export async function expireMission(): Promise<void> {
  const mission = await getMission();
  if (!mission) redirect("/");
  await advanceStage(mission, "finished");
  await updateSession(mission.sid, { expiredAt: Date.now() });
  redirect("/analysis");
}

/** Start over from /analysis (or anywhere): clear cookie, back to Phase 1. */
export async function resetMission(): Promise<void> {
  const store = await cookies();
  store.delete(MISSION_COOKIE);
  redirect("/");
}
