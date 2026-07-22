"use client";

/**
 * Phase 2 client island: 30s review countdown + camera permission gate
 * + proceed/skip controls.
 *
 * Proceed policy: when the countdown ends (or Skip is pressed) we call
 * the markPrepped Server Action. If the camera hasn't been verified,
 * a warning with an explicit "Proceed anyway" override is shown first —
 * the user is warned, never hard-blocked.
 */

import { useState, useTransition } from "react";
import { markPrepped } from "@/actions/mission";
import { useCountdown } from "@/hooks/useCountdown";
import { CountdownRing } from "@/components/ui/CountdownRing";
import { Button } from "@/components/ui/Button";
import { PermissionGate, type CameraStatus } from "./PermissionGate";

const PREP_SECONDS = 30;

export function PrepCountdown() {
  const [camera, setCamera] = useState<CameraStatus>("idle");
  const [needsOverride, setNeedsOverride] = useState(false);
  const [isPending, startTransition] = useTransition();

  const cameraOk = camera === "granted";

  function proceed(force: boolean) {
    if (!cameraOk && !force) {
      setNeedsOverride(true);
      return;
    }
    startTransition(async () => {
      await markPrepped();
    });
  }

  const { secondsLeft, expired } = useCountdown({
    seconds: PREP_SECONDS,
    // No persistKey: refreshing /prep intentionally restarts the 30s review.
    onExpire: () => proceed(false),
  });

  return (
    <div className="flex flex-col gap-4">
      <PermissionGate status={camera} onStatusChange={setCamera} />

      <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
        <div>
          <h3 className="text-sm font-semibold">
            {expired ? "Review time is up" : "Review the briefing"}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
            {expired
              ? "The activity begins as soon as you continue."
              : `Continuing automatically in ${secondsLeft}s — or skip ahead when ready.`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {!expired && <CountdownRing secondsLeft={secondsLeft} totalSeconds={PREP_SECONDS} size={64} />}
          <Button type="button" onClick={() => proceed(false)} disabled={isPending}>
            {isPending ? "Entering activity…" : expired ? "Continue" : "Skip & Start"}
          </Button>
        </div>
      </div>

      {needsOverride && !cameraOk && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between"
        >
          <p>
            Camera access isn&apos;t verified. You can proceed, but the video
            recording step in the activity may not work.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => proceed(true)}
            disabled={isPending}
            className="shrink-0"
          >
            {isPending ? "Entering…" : "Proceed anyway"}
          </Button>
        </div>
      )}
    </div>
  );
}
