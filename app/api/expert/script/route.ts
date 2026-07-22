import { NextResponse } from "next/server";
import { EQUIPMENT_TYPES, SEVERITY_LEVELS, type Equipment, type Severity } from "@/lib/mission";
import { getScopingScript } from "@/lib/expert/scripts/scoping";
import { getQaScript } from "@/lib/expert/scripts/qa";

/**
 * GET /api/expert/script?phase=scoping|qa&equipment=…&severity=…
 *
 * Route Handler (not a Server Action) on purpose: it's *event-driven data
 * fetching* initiated by the client-side channel class — mimicking a chat
 * backend endpoint. Swapping mock → live means swapping URLs, not the hook.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const phase = searchParams.get("phase");
  const equipment = searchParams.get("equipment") as Equipment | null;
  const severity = searchParams.get("severity") as Severity | null;

  if (
    (phase !== "scoping" && phase !== "qa") ||
    !equipment ||
    !EQUIPMENT_TYPES.includes(equipment) ||
    !severity ||
    !SEVERITY_LEVELS.includes(severity)
  ) {
    return NextResponse.json({ error: "Invalid script parameters" }, { status: 400 });
  }

  const script =
    phase === "scoping"
      ? getScopingScript(equipment, severity)
      : getQaScript(equipment, severity);

  return NextResponse.json(script);
}
