"use client";

/**
 * Radio-backed selection card: real <input type="radio"> keeps the form
 * accessible and progressively enhanced; the card styling is the label.
 */

export function SelectionCard({
  name,
  value,
  selected,
  onSelect,
}: {
  name: string;
  value: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`cursor-pointer rounded-xl border-2 p-4 text-center text-sm font-medium transition-colors ${
        selected
          ? "border-blue-600 bg-blue-50 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500"
      }`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={selected}
        onChange={onSelect}
        required
        className="sr-only"
      />
      {value}
    </label>
  );
}
