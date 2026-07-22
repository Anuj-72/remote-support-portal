import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MISSION_COOKIE, hasReached, parseMission } from "@/lib/mission";
import { SafetyInstructions } from "@/components/prep/SafetyInstructions";
import { PrepCountdown } from "@/components/prep/PrepCountdown";

/**
 * Phase 2 — Preparation. Server Component: reads the mission cookie,
 * renders the static safety briefing server-side; only countdown +
 * permission probe are client islands.
 *
 * The redirect below is defense-in-depth behind proxy.ts.
 */
export default async function PrepPage() {
  const store = await cookies();
  const mission = parseMission(store.get(MISSION_COOKIE)?.value);
  if (!mission || !hasReached(mission.stage, "configured")) redirect("/");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Preparation</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Read the safety briefing for your{" "}
          <strong>
            {mission.equipment} · {mission.severity}
          </strong>{" "}
          mission before starting the activity.
        </p>
      </div>
      <SafetyInstructions equipment={mission.equipment} severity={mission.severity} />
      <PrepCountdown />
    </div>
  );
}
