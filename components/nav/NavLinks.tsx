"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { hasReached, type Stage } from "@/lib/mission";

/**
 * Client leaf: needs usePathname for active-link styling. Receives the
 * server-derived stage as a prop — never reads the cookie itself.
 */

const LINKS: { href: string; label: string; min: Stage | null }[] = [
  { href: "/", label: "Setup", min: null },
  { href: "/prep", label: "Prep", min: "configured" },
  { href: "/activity", label: "Activity", min: "prepped" },
  { href: "/analysis", label: "Analysis", min: "finished" },
];

export function NavLinks({ stage }: { stage: Stage | null }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Mission phases" className="flex items-center gap-1 text-sm">
      {LINKS.map(({ href, label, min }) => {
        const unlocked = min === null || (stage !== null && hasReached(stage, min));
        const active = pathname === href;
        if (!unlocked) {
          return (
            <span
              key={href}
              aria-disabled="true"
              className="cursor-not-allowed rounded-md px-3 py-1.5 text-slate-400 dark:text-slate-600"
            >
              {label}
            </span>
          );
        }
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-3 py-1.5 transition-colors ${
              active
                ? "bg-blue-600 text-white"
                : "text-slate-600 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-700/60"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
