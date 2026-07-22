"use client";

/**
 * MissionTimer — 600s activity clock. Deadline persisted in sessionStorage
 * (keyed by sid) so refreshing /activity does NOT reset it. On expiry the
 * parent flushes state via sendBeacon and invokes expireMission.
 */

import { useCountdown } from "@/hooks/useCountdown";

function format(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MissionTimer({
  sid,
  totalSeconds,
  onExpire,
}: {
  sid: string;
  totalSeconds: number;
  onExpire: () => void;
}) {
  const { secondsLeft } = useCountdown({
    seconds: totalSeconds,
    persistKey: `mission-deadline:${sid}`,
    onExpire,
  });

  const urgent = secondsLeft <= 60;

  return (
    <div
      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums ${
        urgent
          ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
          : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
      }`}
      role="timer"
      aria-live={urgent ? "assertive" : "off"}
      aria-label={`Mission time remaining: ${format(secondsLeft)}`}
    >
      <span aria-hidden="true">⏱</span>
      {format(secondsLeft)}
    </div>
  );
}
