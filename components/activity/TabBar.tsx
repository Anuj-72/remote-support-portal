"use client";

/**
 * TabBar — tab switcher whose unlock state is SERVER-derived: the parent
 * passes `unlockedTab` computed from the mission cookie. Clicking a locked
 * tab does nothing; the only unlock path is the completeTab Server Action.
 */

const TAB_LABELS = ["1. Scoping Chat", "2. Recording", "3. Expert QA"] as const;

export function TabBar({
  activeTab,
  unlockedTab,
  onSelect,
}: {
  activeTab: number;
  unlockedTab: number;
  onSelect: (tab: number) => void;
}) {
  return (
    <div role="tablist" aria-label="Activity steps" className="flex gap-1 rounded-xl bg-slate-200/60 p-1 dark:bg-slate-800">
      {TAB_LABELS.map((label, index) => {
        const tab = index + 1;
        const unlocked = tab <= unlockedTab;
        const active = tab === activeTab;
        return (
          <button
            key={label}
            role="tab"
            aria-selected={active}
            aria-disabled={!unlocked}
            disabled={!unlocked}
            onClick={() => unlocked && onSelect(tab)}
            className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                : unlocked
                  ? "text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-700/60"
                  : "cursor-not-allowed text-slate-400 dark:text-slate-600"
            }`}
          >
            {unlocked ? label : `🔒 ${label}`}
          </button>
        );
      })}
    </div>
  );
}
