import { getSafetyDoc } from "@/lib/safety-instructions";
import type { Equipment, Severity } from "@/lib/mission";
import { Card } from "@/components/ui/Card";

/**
 * Server Component: pure static render of the equipment × severity
 * safety document. No interactivity → no client JS shipped.
 */
export function SafetyInstructions({
  equipment,
  severity,
}: {
  equipment: Equipment;
  severity: Severity;
}) {
  const doc = getSafetyDoc(equipment, severity);
  const urgent = severity === "Urgent Fault";

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">{doc.title}</h2>
      <p
        className={`mt-2 rounded-lg p-3 text-sm ${
          urgent
            ? "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200"
            : "bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300"
        }`}
      >
        {doc.intro}
      </p>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-300">
        {doc.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </Card>
  );
}
