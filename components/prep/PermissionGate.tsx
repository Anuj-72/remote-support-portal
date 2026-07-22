"use client";

/**
 * Camera/mic permission check for Phase 2, before entering the activity.
 *
 * getUserMedia is requested on explicit click (browsers penalize
 * on-mount requests, and a user gesture makes the prompt predictable).
 * Denial renders an inline explanation + retry — never a dead end.
 * The stream is stopped immediately: this is a permission *probe*; the
 * RecordingTab acquires its own stream later.
 */

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export type CameraStatus = "idle" | "checking" | "granted" | "denied" | "unsupported";

export function PermissionGate({
  status,
  onStatusChange,
}: {
  status: CameraStatus;
  onStatusChange: (status: CameraStatus) => void;
}) {
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  async function checkPermission() {
    if (!navigator.mediaDevices?.getUserMedia) {
      onStatusChange("unsupported");
      return;
    }
    onStatusChange("checking");
    setErrorDetail(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      // Probe only — release the hardware right away.
      stream.getTracks().forEach((track) => track.stop());
      onStatusChange("granted");
    } catch (err) {
      onStatusChange("denied");
      setErrorDetail(err instanceof DOMException ? err.name : null);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Camera &amp; Microphone</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Tab 2 of the activity records a diagnostic video. Verify access now
            to avoid surprises in the field.
          </p>
        </div>
        {status === "granted" ? (
          <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
            ✓ Ready
          </span>
        ) : (
          <Button
            type="button"
            variant="secondary"
            onClick={checkPermission}
            disabled={status === "checking"}
          >
            {status === "checking"
              ? "Requesting…"
              : status === "denied"
                ? "Retry"
                : "Check access"}
          </Button>
        )}
      </div>

      {status === "denied" && (
        <div
          role="alert"
          className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-100"
        >
          <p className="font-semibold">Camera access was denied{errorDetail === "NotFoundError" ? " (no camera found)" : ""}.</p>
          <p className="mt-1">
            {errorDetail === "NotAllowedError"
              ? "Use the camera icon in your browser's address bar to re-allow access, then retry."
              : "Check that a camera is connected and not in use by another app, then retry."}{" "}
            You can still proceed — the recording step will be limited.
          </p>
        </div>
      )}

      {status === "unsupported" && (
        <p role="alert" className="mt-3 text-xs text-amber-700 dark:text-amber-300">
          This browser does not support camera capture. You can proceed, but
          recording will be unavailable.
        </p>
      )}
    </div>
  );
}
