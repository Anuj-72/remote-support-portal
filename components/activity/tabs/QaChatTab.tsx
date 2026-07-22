"use client";

/**
 * Tab 3 — Post-recording QA with the expert, then "Finish Job"
 * (finishJob Server Action → stage=finished → /analysis).
 */

import { useState, useTransition } from "react";
import { finishJob } from "@/actions/mission";
import type { Equipment, Severity } from "@/lib/mission";
import type { ConversationState } from "@/lib/session-store";
import type { ExpertMode } from "@/lib/expert/create-connection";
import { ExpertPanel } from "@/components/activity/ExpertPanel";
import { Button } from "@/components/ui/Button";

export default function QaChatTab({
  mode,
  equipment,
  severity,
  initial,
}: {
  mode: ExpertMode;
  equipment: Equipment;
  severity: Severity;
  initial: ConversationState | null;
}) {
  const [chatDone, setChatDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleFinish() {
    startTransition(async () => {
      await finishJob();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        The expert has reviewed your recording. Answer their final questions
        to close out the job.
      </p>
      <ExpertPanel
        mode={mode}
        phase="qa"
        equipment={equipment}
        severity={severity}
        initial={initial}
        onDone={setChatDone}
      />
      <div className="flex justify-end">
        <Button
          type="button"
          onClick={handleFinish}
          disabled={!chatDone || isPending}
          title={chatDone ? undefined : "Finish the conversation first"}
        >
          {isPending ? "Finishing…" : "Finish Job ✓"}
        </Button>
      </div>
    </div>
  );
}
