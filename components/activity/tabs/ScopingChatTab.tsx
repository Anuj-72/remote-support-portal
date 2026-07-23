"use client";

/**
 * Tab 1 — Scoping chat with the remote expert. "Completed → Next" enables
 * only once the scripted conversation reaches its end; clicking it runs
 * the completeTab(1) Server Action (the authorization write).
 */

import { useState, useTransition } from "react";
import { completeTab } from "@/actions/mission";
import type { Equipment, Severity } from "@/lib/mission";
import type { ConversationState } from "@/lib/session-store";
import type { ExpertMode } from "@/lib/expert/create-connection";
import { ExpertPanel } from "@/components/activity/ExpertPanel";
import { TechnicianFeed } from "@/components/activity/TechnicianFeed";
import { Button } from "@/components/ui/Button";

export default function ScopingChatTab({
  mode,
  equipment,
  severity,
  initial,
  alreadyCompleted,
  onAdvance,
}: {
  mode: ExpertMode;
  equipment: Equipment;
  severity: Severity;
  initial: ConversationState | null;
  alreadyCompleted: boolean;
  onAdvance: () => void;
}) {
  const [chatDone, setChatDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleComplete() {
    startTransition(async () => {
      await completeTab(1);
      onAdvance();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Describe the situation to the remote expert. They&apos;ll scope the
        problem before you start recording.
      </p>
      <div className="grid items-stretch gap-4 lg:grid-cols-2">
        <TechnicianFeed caption="Your webcam feed is captured in the Recording step. Scope the problem with the expert first." />
        <ExpertPanel
          mode={mode}
          phase="scoping"
          equipment={equipment}
          severity={severity}
          initial={initial}
          onDone={setChatDone}
        />
      </div>
      <div className="flex justify-end">
        {alreadyCompleted ? (
          <Button type="button" variant="secondary" onClick={onAdvance}>
            Go to Recording →
          </Button>
        ) : (
          <Button
            type="button"
            onClick={handleComplete}
            disabled={!chatDone || isPending}
            title={chatDone ? undefined : "Finish the conversation first"}
          >
            {isPending ? "Saving…" : "Completed → Next"}
          </Button>
        )}
      </div>
    </div>
  );
}
