import type { Equipment, Severity } from "@/lib/mission";

/**
 * Static equipment × severity safety-instruction map for Phase 2.
 * Pure data — rendered by a Server Component, no client JS needed.
 */

export interface SafetyDoc {
  title: string;
  intro: string;
  steps: string[];
}

const BASE: Record<Equipment, Omit<SafetyDoc, "intro">> = {
  HVAC: {
    title: "HVAC Unit — Safety Protocol",
    steps: [
      "Isolate the unit at the breaker panel and apply lockout/tagout.",
      "Wait 5 minutes for capacitors to discharge before opening panels.",
      "Wear insulated gloves and safety glasses when probing contactors.",
      "Check refrigerant lines for frost or oil residue before touching.",
      "Verify condensate drain area is dry to avoid slip hazards.",
    ],
  },
  "Industrial Printer": {
    title: "Industrial Printer — Safety Protocol",
    steps: [
      "Open the AC disconnect first, then the DC disconnect.",
      "Remember: panels remain energized in daylight — DC side is never fully dead.",
      "Wait for the inverter's internal capacitor discharge period (see faceplate).",
      "Use a CAT III rated multimeter to verify zero voltage before service.",
      "Never disconnect PV connectors under load — arc flash risk.",
    ],
  },
  "Wind Turbine": {
    title: "Wind Turbine — Safety Protocol",
    steps: [
      "Confirm rotor lock and yaw brake are engaged before entering the nacelle.",
      "Wear a certified harness and clip to anchor points at all times aloft.",
      "Check wind speed — abort climb if sustained winds exceed 12 m/s.",
      "Discharge and verify the converter cabinet before opening.",
      "Maintain radio contact with the ground crew throughout the task.",
    ],
  },
};

const SEVERITY_INTRO: Record<Severity, string> = {
  "Routine Check":
    "Routine inspection. Standard PPE applies. Take your time and log all readings.",
  "Urgent Fault":
    "Urgent fault response. Assume the equipment is in an unknown, potentially unsafe state. Double-check every isolation step before proceeding.",
};

export function getSafetyDoc(equipment: Equipment, severity: Severity): SafetyDoc {
  const base = BASE[equipment];
  return { ...base, intro: SEVERITY_INTRO[severity] };
}
