"use client";

/**
 * Small SVG countdown ring. Pure presentational — parent owns the timer.
 */

export function CountdownRing({
  secondsLeft,
  totalSeconds,
  size = 96,
}: {
  secondsLeft: number;
  totalSeconds: number;
  size?: number;
}) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const offset = circumference * (1 - fraction);
  const urgent = fraction < 0.2;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-slate-200 dark:stroke-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={`transition-[stroke-dashoffset] duration-200 ${urgent ? "stroke-red-500" : "stroke-blue-500"}`}
        />
      </svg>
      <span
        className={`absolute text-lg font-semibold tabular-nums ${urgent ? "text-red-500" : ""}`}
      >
        {secondsLeft}
      </span>
    </div>
  );
}
