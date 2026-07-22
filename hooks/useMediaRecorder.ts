"use client";

/**
 * useMediaRecorder — wraps MediaRecorder over an existing stream.
 *
 * - mimeType negotiation: first supported of webm/vp9 → webm → mp4 (Safari)
 * - on stop, chunks become a Blob → object URL for instant local preview
 * - previous object URL revoked on re-record and on unmount (leak-free)
 * - brief "processing" state between stop and preview so the UI can show
 *   a skeleton instead of flashing
 */

import { useCallback, useEffect, useRef, useState } from "react";

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm",
  "video/mp4",
];

export type RecorderStatus = "idle" | "recording" | "processing" | "previewing" | "error";

export function useMediaRecorder() {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const urlRef = useRef<string | null>(null);

  const revokePreview = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const start = useCallback(
    (stream: MediaStream, onStopped?: () => void) => {
      if (typeof MediaRecorder === "undefined") {
        setError("Recording is not supported in this browser.");
        setStatus("error");
        return;
      }
      revokePreview();
      chunksRef.current = [];
      const mimeType = MIME_CANDIDATES.find((candidate) =>
        MediaRecorder.isTypeSupported(candidate),
      );

      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        setError("Could not start the recorder with this camera.");
        setStatus("error");
        return;
      }

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        setStatus("processing");
        // Small deliberate delay: lets the processing skeleton render and
        // covers slow blob assembly on low-end devices.
        setTimeout(() => {
          const blob = new Blob(chunksRef.current, {
            type: recorder.mimeType || "video/webm",
          });
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          setPreviewUrl(url);
          setStatus("previewing");
          onStopped?.();
        }, 400);
      };
      recorder.onerror = () => {
        setError("Recording failed unexpectedly.");
        setStatus("error");
      };

      recorderRef.current = recorder;
      recorder.start();
      setError(null);
      setStatus("recording");
    },
    [revokePreview],
  );

  const stop = useCallback(() => {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    revokePreview();
    setStatus("idle");
    setError(null);
  }, [revokePreview]);

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  return { status, previewUrl, error, start, stop, reset };
}
