import { cookies } from "next/headers";
import { MISSION_COOKIE, parseMission } from "@/lib/mission";
import { NavLinks } from "./NavLinks";

/**
 * Server Component: reads the mission cookie to show current context
 * (equipment/severity badge). Only the active-link highlighting needs the
 * client (usePathname), so that part is isolated in NavLinks.
 */
export async function NavBar() {
  const store = await cookies();
  const mission = parseMission(store.get(MISSION_COOKIE)?.value);

  return (
    <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold">Field Support Portal</span>
          {mission && (
            <span className="rounded-full bg-blue-100 px-3 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/50 dark:text-blue-200">
              {mission.equipment} · {mission.severity}
            </span>
          )}
        </div>
        <NavLinks stage={mission?.stage ?? null} />
      </div>
    </header>
  );
}
