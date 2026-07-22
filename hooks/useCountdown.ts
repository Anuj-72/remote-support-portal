"use client";

/**
 * Deadline-based countdown: stores an absolute deadline (Date.now() + s*1000)
 * and derives secondsLeft on a 250ms tick — immune to background-tab timer
 * throttling (an interval that fires late still computes the right value).
 *
 * Optional `persistKey` keeps the deadline in sessionStorage so a page
 * refresh does not reset the clock (used by the 600s activity timer; the
 * 30s prep countdown deliberately omits it).
 */

import { useCallback, useEffect, useRef, useState } from "react";

function readPersisted(key: string): number | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const deadline = Number(raw);
    return Number.isFinite(deadline) && deadline > Date.now() ? deadline : null;
  } catch {
    return null;
  }
}

export function useCountdown({
  seconds,
  persistKey,
  onExpire,
}: {
  seconds: number;
  persistKey?: string;
  onExpire?: () => void;
}) {
  // Deadline computed lazily on mount (client only — no SSR Date mismatch).
  const [deadline] = useState<number>(() => {
    if (persistKey && typeof window !== "undefined") {
      const persisted = readPersisted(persistKey);
      if (persisted) return persisted;
    }
    const fresh = Date.now() + seconds * 1000;
    if (persistKey && typeof window !== "undefined") {
      try {
        sessionStorage.setItem(persistKey, String(fresh));
      } catch {
        /* storage unavailable — countdown still works, just won't persist */
      }
    }
    return fresh;
  });

  const compute = useCallback(
    () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
    [deadline],
  );

  const [secondsLeft, setSecondsLeft] = useState<number>(compute);
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const tick = () => {
      const left = compute();
      setSecondsLeft(left);
      if (left <= 0 && !expiredRef.current) {
        expiredRef.current = true;
        clearInterval(id);
        onExpireRef.current?.();
      }
    };
    const id = setInterval(tick, 250);
    tick();
    return () => clearInterval(id);
  }, [compute]);

  const clearPersisted = useCallback(() => {
    if (persistKey) {
      try {
        sessionStorage.removeItem(persistKey);
      } catch {
        /* noop */
      }
    }
  }, [persistKey]);

  return { secondsLeft, expired: secondsLeft <= 0, clearPersisted };
}
