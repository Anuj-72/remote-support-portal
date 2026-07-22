import { SelectionGrid } from "@/components/mission-setup/SelectionGrid";

/**
 * Phase 1 — Mission Setup. Server Component: static shell; only the
 * selection state lives in the client (SelectionGrid).
 */
export default function SetupPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Mission Setup</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-400">
          Configure your field mission. Your selections determine the safety
          briefing and the remote expert&apos;s guidance.
        </p>
      </div>
      <SelectionGrid />
    </div>
  );
}
