import { cookies } from "next/headers";
import { SelectionGrid } from "@/components/mission-setup/SelectionGrid";
import { USER_COOKIE, parseUser } from "@/lib/user";
import { getBalance } from "@/lib/credits-store";

/**
 * Phase 1 — Mission Setup. Server Component: static shell; only the
 * selection state lives in the client (SelectionGrid).
 *
 * The credit balance is server-rendered: the proxy guarantees the `user`
 * cookie exists before this page renders (even on a first visit with no
 * mission), so there is no chicken-egg between identity and balance.
 */
export default async function SetupPage() {
  const store = await cookies();
  const uid = parseUser(store.get(USER_COOKIE)?.value)?.uid;
  const balance = uid ? getBalance(uid) : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Mission Setup</h1>
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            Configure your field mission. Your selections determine the safety
            briefing and the remote expert&apos;s guidance.
          </p>
        </div>
        {balance !== null && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
            ⚡ {balance} credits
          </span>
        )}
      </div>
      <SelectionGrid balance={balance} />
    </div>
  );
}
