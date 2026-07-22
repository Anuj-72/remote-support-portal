/**
 * Mission stage model + cookie helpers.
 *
 * The `mission` cookie is the single *authorization* source of truth:
 * written only by Server Actions, read by proxy.ts (route gate) and
 * server pages (tab gate). It is a plain JSON httpOnly cookie — see
 * README for why it is not signed in this POC and where verification
 * would slot in for production.
 */

export const STAGE_ORDER = [
  "configured", // Phase 1 form submitted
  "prepped", // Phase 2 countdown finished / skipped
  "scoping_done", // Tab 1 completed
  "recording_done", // Tab 2 completed
  "qa_done", // Tab 3 completed
  "finished", // Job finished → /analysis
] as const;

export type Stage = (typeof STAGE_ORDER)[number];

export const EQUIPMENT_TYPES = ["HVAC", "Industrial Printer", "Wind Turbine"] as const;
export const SEVERITY_LEVELS = ["Routine Check", "Urgent Fault"] as const;

export type Equipment = (typeof EQUIPMENT_TYPES)[number];
export type Severity = (typeof SEVERITY_LEVELS)[number];

export interface Mission {
  sid: string;
  stage: Stage;
  equipment: Equipment;
  severity: Severity;
}

export const MISSION_COOKIE = "mission";

/** Ordinal stage comparison — never equality, so a refresh at a later
 *  stage still passes an earlier route's minimum requirement. */
export function hasReached(stage: Stage, required: Stage): boolean {
  return STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(required);
}

export function serializeMission(mission: Mission): string {
  return JSON.stringify(mission);
}

/** Lenient parse: any malformed / hand-edited cookie value → null → treated
 *  as "no mission" by all gates. */
export function parseMission(raw: string | undefined): Mission | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (
      typeof data.sid !== "string" ||
      !STAGE_ORDER.includes(data.stage) ||
      !EQUIPMENT_TYPES.includes(data.equipment) ||
      !SEVERITY_LEVELS.includes(data.severity)
    ) {
      return null;
    }
    return data as Mission;
  } catch {
    return null;
  }
}
