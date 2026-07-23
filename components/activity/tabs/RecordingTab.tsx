"use client";

/**
 * Tab 2 — Diagnostic video recording. Fully client-side: live preview via
 * srcObject, MediaRecorder capture, object-URL playback. The blob never
 * leaves the browser (POC scope — README documents the production upload
 * path); only the `recorded` flag is persisted.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import { completeTab } from "@/actions/mission";
import { useMediaStream } from "@/hooks/useMediaStream";
import { useMediaRecorder } from "@/hooks/useMediaRecorder";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";

export default function RecordingTab({
  alreadyCompleted,
  wasRecorded,
  onAdvance,
}: {
  alreadyCompleted: boolean;
  wasRecorded: boolean;
  onAdvance: () => void;
}) {
  const { state: streamState, start: startStream, stop: stopStream } = useMediaStream();
  const { status, previewUrl, error, start: startRecorder, stop: stopRecorder, reset } =
    useMediaRecorder();
  const [recordedFlag, setRecordedFlag] = useState(wasRecorded);
  const [isPending, startTransition] = useTransition();
  const liveVideoRef = useRef<HTMLVideoElement>(null);

  // Attach live stream to the preview element.
  useEffect(() => {
    if (liveVideoRef.current && streamState.status === "active") {
      liveVideoRef.current.srcObject = streamState.stream;
    }
  }, [streamState]);

  async function handleStart() {
    const stream = streamState.status === "active" ? streamState.stream : await startStream();
    if (!stream) return;
    startRecorder(stream, () => {
      // Persist only the flag — see module docstring.
      setRecordedFlag(true);
      fetch("/api/session", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recorded: true }),
        keepalive: true,
      }).catch(() => {});
      stopStream(); // release camera as soon as recording stops
    });
  }

  function handleStop() {
    stopRecorder();
  }

  function handleRetake() {
    reset();
  }

  function handleComplete() {
    startTransition(async () => {
      await completeTab(2);
      onAdvance();
    });
  }

  const canComplete = recordedFlag || status === "previewing";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Record a short video of the equipment so the expert can review it.
        The video stays on this device — only a completion flag is saved.
      </p>

      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-black dark:border-slate-700">
            {status === "previewing" && previewUrl ? (
              <video src={previewUrl} controls playsInline className="aspect-video w-full" />
            ) : status === "processing" ? (
              <div className="flex aspect-video w-full items-center justify-center bg-slate-900">
                <div className="flex flex-col items-center gap-3">
                  <Skeleton className="h-4 w-40" />
                  <p className="text-xs text-slate-400">Processing recording…</p>
                </div>
              </div>
            ) : streamState.status === "active" ? (
              <video ref={liveVideoRef} autoPlay muted playsInline className="aspect-video w-full" />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center">
                <p className="px-6 text-center text-sm text-slate-400">
                  {streamState.status === "requesting"
                    ? "Requesting camera…"
                    : recordedFlag
                      ? "Recording already completed. You can re-record or continue."
                      : "Camera preview will appear here."}
                </p>
              </div>
            )}
          </div>

          {streamState.status === "denied" && (
            <div role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
              {streamState.reason}
            </div>
          )}
          {streamState.status === "unsupported" && (
            <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
              This browser cannot record video. You may continue without a recording.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        {/* Right panel: persistent "Remote Expert" region, mirroring the
            split-screen mockup. In this tab the expert is passively watching
            the recording rather than chatting. */}
        <div className="flex flex-col rounded-xl border border-slate-200">
          <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
            Remote Expert
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            {status === "recording" ? (
              <>
                <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-800">Live Feed Active</p>
                <p className="text-xs text-slate-500">
                  Camera and microphone are streaming to the Remote Expert.
                </p>
                <p className="text-xs italic text-slate-400">Listening for repair narrative…</p>
              </>
            ) : status === "previewing" ? (
              <>
                <span className="text-2xl" aria-hidden="true">✓</span>
                <p className="text-sm font-semibold text-slate-800">Recording captured</p>
                <p className="text-xs text-slate-500">
                  Review the clip, then continue to Expert QA for the final review.
                </p>
              </>
            ) : status === "processing" ? (
              <p className="text-xs text-slate-500">Preparing your recording for review…</p>
            ) : (
              <>
                <span className="h-3 w-3 rounded-full bg-slate-300" aria-hidden="true" />
                <p className="text-sm font-semibold text-slate-800">Expert standing by</p>
                <p className="text-xs text-slate-500">
                  Start recording to stream your repair to the remote expert.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {status === "recording" ? (
            <Button type="button" variant="danger" onClick={handleStop}>
              ⏹ Stop recording
            </Button>
          ) : status === "previewing" ? (
            <Button type="button" variant="secondary" onClick={handleRetake}>
              ↺ Re-record
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleStart}
              disabled={streamState.status === "requesting" || status === "processing"}
            >
              {streamState.status === "requesting"
                ? "Starting camera…"
                : recordedFlag
                  ? "● Record again"
                  : "● Start recording"}
            </Button>
          )}
        </div>

        {alreadyCompleted ? (
          <Button type="button" variant="secondary" onClick={onAdvance}>
            Go to Expert QA →
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleComplete}
            disabled={!canComplete || isPending || status === "recording" || status === "processing"}
            title={canComplete ? undefined : "Record a video first"}
          >
            {isPending ? "Saving…" : "Completed → Next"}
          </Button>
        )}
      </div>
    </div>
  );
}
