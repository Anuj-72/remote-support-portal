import type { Equipment, Severity } from "@/lib/mission";
import type { ExpertScript } from "@/lib/expert/types";

/**
 * Scoping-phase scripts (Tab 1), keyed by equipment. The greeting and
 * urgency-dependent lines interpolate the Phase 1 config so the chat
 * clearly reflects the user's selections.
 */

const EQUIPMENT_QUESTIONS: Record<Equipment, { q1: string; q1Sim: string; q2: string; q2Sim: string; wrap: string }> = {
  HVAC: {
    q1: "What symptoms is the unit showing — no cooling, short cycling, unusual noise, or something else?",
    q1Sim: "It's short cycling — compressor kicks on for about 30 seconds then trips out.",
    q2: "Got it. Can you check the condenser coil and tell me if there's visible icing or debris buildup?",
    q2Sim: "Coil looks clean but there's heavy icing on the suction line.",
    wrap: "That points to a refrigerant or airflow issue. We'll confirm visually in the next step — I'll need you to record the unit running.",
  },
  "Industrial Printer": {
    q1: "What's the inverter showing — any fault codes on the display, or is it completely dark?",
    q1Sim: "Display shows fault code E031 and the grid LED is blinking red.",
    q2: "Understood. Is the DC input voltage reading within the expected range on the display, or is it fluctuating?",
    q2Sim: "DC voltage is fluctuating between 180V and 420V, way outside spec.",
    wrap: "That fluctuation suggests a string or connector problem upstream. Next step: record the display and the DC disconnect area so I can take a look.",
  },
  "Wind Turbine": {
    q1: "What alerted you to this turbine — SCADA alarm, visual damage, or abnormal sound from the nacelle?",
    q1Sim: "SCADA flagged repeated gearbox oil over-temperature alarms overnight.",
    q2: "Okay. Before anything else — is the rotor currently locked out, and what's the oil temperature reading right now?",
    q2Sim: "Rotor is locked, oil temp reading 68°C at idle which seems high.",
    wrap: "High idle oil temp usually means cooler or sensor trouble. I'll need video of the gearbox cooler and sensor wiring next.",
  },
};

export function getScopingScript(equipment: Equipment, severity: Severity): ExpertScript {
  const q = EQUIPMENT_QUESTIONS[equipment];
  const urgent = severity === "Urgent Fault";

  return {
    greeting: `Hi, this is Sam from Remote Support. I can see your job on my screen: ${equipment}, ${severity.toLowerCase()}.${urgent ? " I've prioritized this session — let's move fast but safely." : ""}`,
    steps: [
      {
        id: "scoping-q1",
        expertMessages: [q.q1],
        expectsUserReply: true,
        simulatedUserLine: q.q1Sim,
      },
      {
        id: "scoping-q2",
        expertMessages: [q.q2],
        expectsUserReply: true,
        simulatedUserLine: q.q2Sim,
      },
      {
        id: "scoping-wrap",
        expertMessages: [
          q.wrap,
          "Mark this step complete when you're ready to start recording.",
        ],
        expectsUserReply: false,
      },
    ],
  };
}
