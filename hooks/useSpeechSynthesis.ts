"use client";

/**
 * useSpeechSynthesis — speaks expert messages aloud (bonus).
 * Mute toggle; pending utterances cancelled on mute and on unmount.
 * No-ops cleanly where speechSynthesis is unavailable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePageHideCleanup } from "./usePageHideCleanup";

export function useSpeechSynthesis() {
  const [muted, setMuted] = useState(true); // opt-in: browsers dislike auto-audio
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const speak = useCallback(
    (text: string) => {
      if (!supported || mutedRef.current) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    },
    [supported],
  );

  const toggleMuted = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (next && supported) window.speechSynthesis.cancel();
      return next;
    });
  }, [supported]);

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  // Tab close / hide: no lingering audio after the page is gone or hidden.
  usePageHideCleanup(() => {
    if (supported) window.speechSynthesis.cancel();
  }, { onHidden: true });

  return { supported, muted, toggleMuted, speak };
}
