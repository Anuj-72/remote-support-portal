"use client";

/**
 * ActivityShell — client orchestrator for Phase 3.
 *
 * - Tabs are separate chunks via next/dynamic (ssr:false where browser
 *   APIs are mandatory — MediaRecorder in RecordingTab); TabSkeleton
 *   bridges the chunk load.
 * - `unlockedTab` is a SERVER-derived prop (from the mission cookie).
 *   completeTab revalidates /activity, so the RSC re-render refreshes it
 *   in the same round trip; local `activeTab` survives that re-render.
 * - 600s mission timer: on expiry, flush pending state via
 *   navigator.sendBeacon (Blob wrapped as application/json — plain string
 *   beacons post as text/plain) then run the expireMission action.
 */

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { expireMission } from "@/actions/mission";
import type { Mission } from "@/lib/mission";
import type { SessionData } from "@/lib/session-store";
import type { ExpertMode } from "@/lib/expert/create-connection";
import { TabBar } from "./TabBar";
import { MissionTimer } from "./MissionTimer";
import { TabSkeleton } from "./TabSkeleton";

const ScopingChatTab = dynamic(() => import("./tabs/ScopingChatTab"), {
  loading: () => <TabSkeleton />,
});
const RecordingTab = dynamic(() => import("./tabs/RecordingTab"), {
  ssr: false, // MediaRecorder/getUserMedia have no server story at all
  loading: () => <TabSkeleton />,
});
const QaChatTab = dynamic(() => import("./tabs/QaChatTab"), {
  loading: () => <TabSkeleton />,
});

const MISSION_SECONDS = 600;

export function ActivityShell({
  mission,
  session,
  unlockedTab,
  mode,
}: {
  mission: Mission;
  session: SessionData | null;
  unlockedTab: number;
  mode: ExpertMode;
}) {
  // Start on the highest unlocked tab (resume-friendly).
  const [activeTab, setActiveTab] = useState(unlockedTab);
  const [, startTransition] = useTransition();
  const [expired, setExpired] = useState(false);

  function handleExpire() {
    setExpired(true);
    // Chat state is already autosaved per-exchange; the beacon is a final
    // belt-and-braces flush that survives the imminent navigation.
    try {
      navigator.sendBeacon(
        "/api/session",
        new Blob([JSON.stringify({})], { type: "application/json" }),
      );
    } catch {
      /* beacon best-effort */
    }
    try {
      sessionStorage.removeItem(`mission-deadline:${mission.sid}`);
    } catch {
      /* noop */
    }
    startTransition(async () => {
      await expireMission();
    });
  }

  const common = {
    mode,
    equipment: mission.equipment,
    severity: mission.severity,
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <TabBar activeTab={activeTab} unlockedTab={unlockedTab} onSelect={setActiveTab} />
        <MissionTimer sid={mission.sid} totalSeconds={MISSION_SECONDS} onExpire={handleExpire} />
      </div>

      {expired ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200">
          Mission time expired. Saving your progress…
        </div>
      ) : activeTab === 1 ? (
        <ScopingChatTab
          {...common}
          initial={session?.scoping ?? null}
          alreadyCompleted={unlockedTab > 1}
          onAdvance={() => setActiveTab(2)}
        />
      ) : activeTab === 2 ? (
        <RecordingTab
          alreadyCompleted={unlockedTab > 2}
          wasRecorded={session?.recorded ?? false}
          onAdvance={() => setActiveTab(3)}
        />
      ) : (
        <QaChatTab {...common} initial={session?.qa ?? null} />
      )}
    </div>
  );
}
