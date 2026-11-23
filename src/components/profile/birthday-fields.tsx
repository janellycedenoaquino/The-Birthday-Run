"use client";

import { useId, useState } from "react";
import { Label } from "@/components/ui/label";
import { msg } from "@/lib/messages";

// Month and day selects (S-101, S-108; FR-6). No year field (NFR-3). The day list follows the
// month, with Feb 29 listed (FR-6), and picking it shows M-278 (FR-49).

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
// The longest each month gets, so Feb 29 is offered; the server checks again (BR-18).
const DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export const selectClass =
  "h-11 w-full rounded-md border border-input bg-background px-3 text-base shadow-xs focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive";

export function BirthdayFields({
  month: initialMonth,
  day: initialDay,
  dayErrors,
}: {
  month?: number | null;
  day?: number | null;
  dayErrors?: string[];
}) {
  const id = useId();
  const [month, setMonth] = useState(initialMonth ?? 0);
  const [day, setDay] = useState(initialDay ?? 0);
  const maxDay = month ? DAYS_IN[month - 1]! : 31;
  const invalid = dayErrors?.length ? true : undefined;

  return (
    <div className="grid gap-2">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          <Label htmlFor={`${id}-month`}>Month</Label>
          <select
            id={`${id}-month`}
            name="month"
            required
            value={month || ""}
            onChange={(e) => {
              const m = Number(e.target.value);
              setMonth(m);
              if (day > DAYS_IN[m - 1]!) setDay(0);
            }}
            className={selectClass}
          >
            <option value="" disabled>
              Month
            </option>
            {MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`${id}-day`}>Day</Label>
          <select
            id={`${id}-day`}
            name="day"
            required
            value={day || ""}
            onChange={(e) => setDay(Number(e.target.value))}
            aria-invalid={invalid}
            aria-describedby={invalid ? `${id}-day-error` : undefined}
            className={selectClass}
          >
            <option value="" disabled>
              Day
            </option>
            {Array.from({ length: maxDay }, (_, i) => (
              <option key={i + 1} value={i + 1}>
                {i + 1}
              </option>
            ))}
          </select>
        </div>
      </div>
      {invalid ? (
        <p id={`${id}-day-error`} className="text-sm text-destructive">
          {dayErrors![0]}
        </p>
      ) : null}
      {month === 2 && day === 29 ? (
        <p className="text-sm text-muted-foreground">{msg("M-278")}</p>
      ) : null}
    </div>
  );
}
