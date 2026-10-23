import { useState } from "react";
import type { ReportPeriod } from "../types";

type Choice = "7d" | "30d" | "all" | "custom";

const CHOICES: { value: Choice; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range" },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The period of "Last N days" at `now`: from N days ago, open at the end. */
export function lastDays(days: number, now = new Date()): ReportPeriod {
  return { from: new Date(now.getTime() - days * DAY_MS).toISOString() };
}

/** A custom range of two `YYYY-MM-DD` dates in the computer's time zone: from the start of the first day to the start of the day after the last. */
function customPeriod(firstDay: string, lastDay: string): ReportPeriod | undefined {
  const [fy, fm, fd] = firstDay.split("-").map(Number);
  const [ty, tm, td] = lastDay.split("-").map(Number);
  if (!fy || !ty) return undefined;
  return { from: new Date(fy, fm! - 1, fd).toISOString(), to: new Date(ty, tm! - 1, td! + 1).toISOString() };
}

/**
 * report-provider-usage (JOS-223), design Decision 7 — the period every `/admin` report takes (JOS-224 and JOS-225 reuse it).
 * "Last 30 days" is selected first; each change reports the period it stands for (a custom range once both dates are set).
 */
export function ReportPeriodSelector({ onChange }: { onChange: (period: ReportPeriod) => void }) {
  const [choice, setChoice] = useState<Choice>("30d");
  const [firstDay, setFirstDay] = useState("");
  const [lastDay, setLastDay] = useState("");

  function choose(next: Choice) {
    setChoice(next);
    if (next === "7d") onChange(lastDays(7));
    else if (next === "30d") onChange(lastDays(30));
    else if (next === "all") onChange({});
    else {
      const period = firstDay && lastDay ? customPeriod(firstDay, lastDay) : undefined;
      if (period) onChange(period);
    }
  }

  function pick(first: string, last: string) {
    setFirstDay(first);
    setLastDay(last);
    const period = first && last ? customPeriod(first, last) : undefined;
    if (period) onChange(period);
  }

  return (
    <fieldset>
      <legend>Period</legend>
      {CHOICES.map(({ value, label }) => (
        <label key={value}>
          <input type="radio" name="report-period" checked={choice === value} onChange={() => choose(value)} /> {label}
        </label>
      ))}
      {choice === "custom" && (
        <div>
          <label>
            From date <input type="date" value={firstDay} onChange={(event) => pick(event.target.value, lastDay)} />
          </label>
          <label>
            To date <input type="date" value={lastDay} onChange={(event) => pick(firstDay, event.target.value)} />
          </label>
        </div>
      )}
    </fieldset>
  );
}
