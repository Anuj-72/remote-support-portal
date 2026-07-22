"use client";

/**
 * Client leaf for Phase 1: local selection state + useFormStatus pending.
 * Submits a plain <form action={startMission}> — progressive enhancement:
 * with JS disabled the radios + submit still work (native form post).
 */

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { startMission } from "@/actions/mission";
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

export function SelectionGrid() {
  const [equipment, setEquipment] = useState<Equipment | null>(null);
  const [severity, setSeverity] = useState<Severity | null>(null);
  const ready = equipment !== null && severity !== null;

  return (
    <form action={startMission} className="flex flex-col gap-8">
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

      <div className="flex items-center gap-4">
        <SubmitButton ready={ready} />
        {!ready && (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Select equipment and severity to continue.
          </p>
        )}
      </div>
    </form>
  );
}
