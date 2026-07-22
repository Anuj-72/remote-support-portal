import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MISSION_COOKIE, hasReached, parseMission } from "@/lib/mission";
import { readSession } from "@/lib/session-store";
import { resetMission } from "@/actions/mission";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Placeholder end screen — Server Component summarizing the persisted
 * session (message counts, recording flag, how the mission ended).
 */
export default async function AnalysisPage() {
  const store = await cookies();
  const mission = parseMission(store.get(MISSION_COOKIE)?.value);
  if (!mission || !hasReached(mission.stage, "finished")) redirect("/");

  const session = await readSession(mission.sid);
  const scopingCount = session?.scoping?.transcript.length ?? 0;
  const qaCount = session?.qa?.transcript.length ?? 0;
  const endedByExpiry = Boolean(session?.expiredAt);

  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div>
        <h1 className="text-2xl font-bold">
          {endedByExpiry ? "Mission Time Expired" : "Mission Complete"}
        </h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          {endedByExpiry
            ? "The 10-minute window closed — your progress was saved."
            : "Job closed out with the remote expert."}
        </p>
      </div>

      <Card className="w-full max-w-md p-6 text-left">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Session Summary
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Mission</dt>
            <dd className="font-medium">
              {mission.equipment} · {mission.severity}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Scoping messages</dt>
            <dd className="font-medium">{scopingCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">Diagnostic recording</dt>
            <dd className="font-medium">{session?.recorded ? "Captured ✓" : "Not captured"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500 dark:text-slate-400">QA messages</dt>
            <dd className="font-medium">{qaCount}</dd>
          </div>
        </dl>
        <p className="mt-4 rounded-lg bg-slate-100 p-3 text-xs text-slate-500 dark:bg-slate-700/50 dark:text-slate-400">
          Full mission analysis (transcript review, recording annotations,
          expert scoring) would render here in the production build.
        </p>
      </Card>

      <form action={resetMission}>
        <Button type="submit" variant="secondary">
          Start a new mission
        </Button>
      </form>
    </div>
  );
}
