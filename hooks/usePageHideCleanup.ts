"use client";

/**
 * usePageHideCleanup — run a terminal-cleanup callback when the page is
 * being torn down or hidden.
 *
 * Why this exists: React's effect cleanup does NOT run when a tab is closed
 * — the component is destroyed, never unmounted. Without an explicit
 * pagehide listener, an in-flight LLM fetch, a speechSynthesis queue, or a
 * camera stream would leak (or keep the camera LED on) until the browser
 * reclaims the tab. This hook registers both terminal events and guarantees
 * the callback runs at most once per registration.
 *
 * Events:
 * - `pagehide` — the page is going away (tab close, window close, hard
 *   navigation, bfcache). Runs for everyone.
 * - `visibilitychange → hidden` — the tab was merely hidden (user switched
 *   tabs, phone locked). Opt-in via `onHidden` for *hardware* resources
 *   (camera, mic, voice) that shouldn't stay active in the background.
 *   Stateful conversations do NOT subscribe to it — switching tabs must not
 *   kill an in-progress chat.
 *
 * The callback is held in a ref, so callers can pass an inline closure
 * without re-registering the listeners on every render.
 */

import { useEffect, useRef } from "react";

export function usePageHideCleanup(
  callback: () => void,
  options?: { onHidden?: boolean },
): void {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      callbackRef.current();
    };
    const onPageHide = () => run();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") run();
    };
    window.addEventListener("pagehide", onPageHide);
    if (options?.onHidden) {
      document.addEventListener("visibilitychange", onVisibility);
    }
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [options?.onHidden]);
}
