"use client";

/**
 * useMediaStream — acquires a camera+mic stream on demand, releases on
 * unmount. Errors surface as user-readable state, not throws.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type StreamState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "active"; stream: MediaStream }
  | { status: "denied"; reason: string }
  | { status: "unsupported" };

export function useMediaStream() {
  const [state, setState] = useState<StreamState>({ status: "idle" });
  const streamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setState({ status: "idle" });
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ status: "unsupported" });
      return null;
    }
    setState({ status: "requesting" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      setState({ status: "active", stream });
      return stream;
    } catch (err) {
      const reason =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Permission denied. Re-allow camera access via the browser address bar, then retry."
          : err instanceof DOMException && err.name === "NotFoundError"
            ? "No camera found. Connect a camera and retry."
            : "Could not access the camera. It may be in use by another application.";
      setState({ status: "denied", reason });
      return null;
    }
  }, []);

  // Release hardware on unmount (tab switch unmounts the recording tab).
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  return { state, start, stop };
}
