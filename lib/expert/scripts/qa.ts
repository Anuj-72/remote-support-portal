import type { Equipment, Severity } from "@/lib/mission";
import type { ExpertScript } from "@/lib/expert/types";

/**
 * QA-phase scripts (Tab 3): the expert has "reviewed" the recording and
 * closes out with verification questions.
 */

const QA_BY_EQUIPMENT: Record<Equipment, { review: string; q1: string; q1Sim: string; q2: string; q2Sim: string; closing: string }> = {
  HVAC: {
    review: "I've gone through your recording. The icing pattern on the suction line confirms low refrigerant charge or restricted airflow.",
    q1: "Did you get a chance to check the filter and blower during the recording — any restriction there?",
    q1Sim: "Filter was replaced last month, blower spins freely. No restriction I can see.",
    q2: "Then we're looking at a charge issue. Are you certified to handle refrigerant, or should I schedule a licensed tech for the recharge?",
    q2Sim: "I'm EPA 608 certified — I can handle the recharge with the right parts.",
    closing: "Great. I'm logging this as low refrigerant charge, leak check + recharge required. Parts order goes out today.",
  },
  "Industrial Printer": {
    review: "Reviewed your footage. The DC voltage swing you captured points squarely at a failing string connector, not the inverter itself.",
    q1: "In the video, the string 2 connector looked discolored. Did it feel loose or show any heat damage up close?",
    q1Sim: "Yes — string 2 MC4 connector was visibly browned and slightly loose.",
    q2: "That's our culprit. Do you have a replacement MC4 pair on the truck, or do we need to leave the string isolated until parts arrive?",
    q2Sim: "I have spare MC4 connectors — I can swap it once the array is isolated.",
    closing: "Perfect. Logging: replace string 2 MC4 connector, torque-check remaining strings. Nice work today.",
  },
  "Wind Turbine": {
    review: "Your recording confirms it — the gearbox cooler fan isn't spinning up, and the sensor wiring looks intact. It's the cooler, not the sensor.",
    q1: "Did the cooler fan motor respond at all when the temperature climbed, or is it completely dead?",
    q1Sim: "Completely dead — no response even at 70°C oil temp.",
    q2: "Understood. The turbine stays curtailed until the fan motor is replaced. Can you confirm the rotor lock stays engaged before you descend?",
    q2Sim: "Confirmed — rotor lock engaged and tagged, descending shortly.",
    closing: "Logged: gearbox cooler fan motor replacement, turbine curtailed until service. Safe climb down.",
  },
};

export function getQaScript(equipment: Equipment, severity: Severity): ExpertScript {
  const q = QA_BY_EQUIPMENT[equipment];
  const urgent = severity === "Urgent Fault";

  return {
    greeting: `Thanks for the recording — give me a second to pull it up.${urgent ? " I've flagged the review as urgent." : ""}`,
    steps: [
      {
        id: "qa-review",
        expertMessages: [q.review],
        expectsUserReply: false,
      },
      {
        id: "qa-q1",
        expertMessages: [q.q1],
        expectsUserReply: true,
        simulatedUserLine: q.q1Sim,
      },
      {
        id: "qa-q2",
        expertMessages: [q.q2],
        expectsUserReply: true,
        simulatedUserLine: q.q2Sim,
      },
      {
        id: "qa-closing",
        expertMessages: [q.closing, "You can finish the job whenever you're ready."],
        expectsUserReply: false,
      },
    ],
  };
}
