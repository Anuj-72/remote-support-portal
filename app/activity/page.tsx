import { Suspense } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MISSION_COOKIE, hasReached, parseMission, type Mission } from "@/lib/mission";
import { readSession } from "@/lib/session-store";
import { ActivityShell } from "@/components/activity/ActivityShell";
import { TabSkeleton } from "@/components/activity/TabSkeleton";
import type { ExpertMode } from "@/lib/expert/create-connection";

/**
 * Phase 3 — Activity. Server Component responsibilities:
 * - defense-in-depth stage check (behind proxy.ts)
 * - derive `unlockedTab` from the cookie stage — the client can only ever
 *   see tabs the server has authorized
 * - decide expert mode from env key presence (key itself never ships)
 * - stream the session store read through Suspense so the static shell
 *   paints immediately
 */

function unlockedTabFor(mission: Mission): number {
  if (hasReached(mission.stage, "recording_done")) return 3;
  if (hasReached(mission.stage, "scoping_done")) return 2;
  return 1;
}

async function ActivityLoader({ mission }: { mission: Mission }) {
  const session = await readSession(mission.sid);
  const mode: ExpertMode = process.env.GROQ_API_KEY ? "live" : "mock";
  return (
    <ActivityShell
      mission={mission}
      session={session}
      unlockedTab={unlockedTabFor(mission)}
      mode={mode}
    />
  );
}

export default async function ActivityPage() {
  const store = await cookies();
  const mission = parseMission(store.get(MISSION_COOKIE)?.value);
  if (!mission || !hasReached(mission.stage, "prepped")) redirect("/");
  if (mission.stage === "finished") redirect("/analysis");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold">Live Activity</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Complete all three steps before the mission timer runs out.
        </p>
      </div>
      <Suspense fallback={<TabSkeleton />}>
        <ActivityLoader mission={mission} />
      </Suspense>
    </div>
  );
}
