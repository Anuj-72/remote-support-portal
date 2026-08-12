"use client";

/**
 * Client leaf for Phase 1: local selection state + useActionState for the
 * startMission action + useFormStatus pending.
 *
 * The form is progressively enhanced: with JS disabled the radios + submit
 * still work (native form post). The inline error banners below are the JS
 * path — the action returns { ok: false, reason, balance } instead of
 * redirecting whenever the mission cannot start (no credits, a mission
 * already in progress, or an invalid selection).
 */

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { startMission, type StartMissionResult } from "@/actions/mission";
import {
  EQUIPMENT_TYPES,
  SEVERITY_LEVELS,
  type Equipment,
  type Severity,
} from "@/lib/mission";
import { SelectionCard } from "./SelectionCard";

function SubmitButton({ ready }: { ready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={!ready || pending}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-blue-600/40 disabled:text-white/70"
    >
      {pending ? "Starting mission…" : "Start Mission"}
    </button>
  );
}

function ErrorBanner({
  state,
}: {
  state: Extract<StartMissionResult, { ok: false }>;
}) {
  const message =
    state.reason === "insufficient_balance" ? (
      <>
        Not enough credits — this mission costs <strong>100</strong> and your
        balance is <strong>{state.balance}</strong>. Starting over after a
        mission will need another 100.
      </>
    ) : state.reason === "mission_in_progress" ? (
      <>
        A mission is already in progress. Resume it from the Prep or Activity
        tabs, or leave it from inside the activity.
      </>
    ) : (
      <>Select both an equipment type and a severity to continue.</>
    );

  return (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/30 dark:text-red-200"
    >
      {message}
    </p>
  );
}

export function SelectionGrid({ balance }: { balance: number | null }) {
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const ready = equipment !== null && severity !== null;

  // initial = null → no banner until the first submit.
  const [state, formAction] = useActionState<StartMissionResult | null, FormData>(
    startMission,
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <fieldset>
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Equipment Type
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {EQUIPMENT_TYPES.map((value) => (
            <SelectionCard
              key={value}
              name="equipment"
              value={value}
              selected={equipment === value}
              onSelect={() => setEquipment(value)}
            />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Issue Severity
        </legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SEVERITY_LEVELS.map((value) => (
            <SelectionCard
              key={value}
              name="severity"
              value={value}
              selected={severity === value}
              onSelect={() => setSeverity(value)}
            />
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton ready={ready} />
        {!ready && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Select equipment and severity to continue.
          </p>
        )}
        {balance !== null && (
          <p className="ml-auto text-sm text-slate-500 dark:text-slate-400">
            This mission costs <strong className="text-slate-700 dark:text-slate-200">100 credits</strong> · your balance:{" "}
            <strong className="text-slate-700 dark:text-slate-200">{balance}</strong>
          </p>
        )}
      </div>

      {state && !state.ok ? <ErrorBanner state={state} /> : null}
    </form>
  );
}
