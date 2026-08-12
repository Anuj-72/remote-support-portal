"use client";

/**
 * LeavingGuard — the "you will lose your 100 credits" warning for the
 * activity phase (PLAN §6).
 *
 * Two layers, because the browser only gives us one of them:
 *
 * 1. A conditional `beforeunload` listener — the backstop for tab/window
 *    close. Attached only while this component is mounted (i.e. a mission
 *    is in progress) and removed on unmount; a permanently-attached
 *    listener would disable the bfcache. Browsers show only a GENERIC
 *    dialog here — custom text is ignored, so this layer is purely the
 *    safety net.
 * 2. An in-app "Leave mission" modal — the only place the real copy the
 *    requirement asks for can actually be displayed.
 *
 * "Leave mission" calls resetMission: the mission cookie is deleted, the
 * account's activeMission is cleared, and NO refund is issued — the 100
 * credits were charged at startMission regardless of where the mission
 * ends. Enforcement is server-side; this UI is honesty, not billing logic.
 */

import { startTransition, useEffect, useState } from "react";
import { resetMission } from "@/actions/mission";
import { Button } from "@/components/ui/Button";

export function LeavingGuard() {
  const [confirming, setConfirming] = useState(false);

  // Layer 1 — beforeunload backstop. Conditional by construction: mounted
  // only inside the activity shell; removed when the mission ends.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = true; // legacy Chrome <119; modern browsers show a generic dialog
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // Layer 2 — in-app modal with the real copy. Escape closes it.
  useEffect(() => {
    if (!confirming) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming]);

  function handleLeave() {
    startTransition(async () => {
      await resetMission();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-900/30"
      >
        Leave mission
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-mission-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          onClick={() => setConfirming(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-800"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="leave-mission-title" className="text-lg font-semibold">
              Leave this mission?
            </h2>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              You will lose your <strong>100 credits</strong>. Credits are
              charged when a mission starts and are{" "}
              <strong>not refunded</strong>, no matter where you leave. This
              mission cannot be resumed once you leave.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                autoFocus
                onClick={() => setConfirming(false)}
              >
                Stay on mission
              </Button>
              <Button type="button" variant="danger" onClick={handleLeave}>
                Leave mission
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
