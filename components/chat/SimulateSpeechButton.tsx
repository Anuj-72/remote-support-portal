"use client";

/**
 * Bonus: "Simulate speech" — feeds the script's pre-canned technician line
 * through the exact same send() path as typed input. Hidden when the
 * current step has no canned line or input is disabled.
 */

export function SimulateSpeechButton({
  canSend,
  getLine,
  onSend,
}: {
  canSend: boolean;
  getLine: () => string | undefined;
  onSend: (text: string) => void;
}) {
  if (!canSend) return null;
  const line = getLine();
  if (!line) return null;

  return (
    <button
      type="button"
      onClick={() => onSend(line)}
      className="mb-1 rounded-full border border-dashed border-slate-300 px-3 py-1 text-xs text-slate-500 hover:border-blue-400 hover:text-blue-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-blue-500 dark:hover:text-blue-400"
      title="Send a simulated voice reply"
    >
      🎤 Simulate speech: “{line.length > 60 ? `${line.slice(0, 60)}…` : line}”
    </button>
  );
}
