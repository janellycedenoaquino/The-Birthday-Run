"use client";

import { useId } from "react";
import { Label } from "@/components/ui/label";
import { selectClass } from "./birthday-fields";

// An IANA time-zone select (S-108, and S-101 when detection fails; D4). Native, so typing a
// name jumps to it and it works without JS. The server checks the value again (BR-19).
export function TimeZoneSelect({
  zones,
  value,
  errors,
  hint,
}: {
  zones: string[];
  value?: string | null;
  errors?: string[];
  hint?: string;
}) {
  const id = useId();
  const invalid = errors?.length ? true : undefined;
  // The current zone first (SPEC S-108), then the rest in order.
  const ordered = value ? [value, ...zones.filter((z) => z !== value)] : zones;
  const describedBy =
    [hint ? `${id}-hint` : null, invalid ? `${id}-error` : null]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Time zone</Label>
      <select
        id={id}
        name="timeZone"
        required
        defaultValue={value ?? ""}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        className={selectClass}
      >
        <option value="" disabled>
          Choose your time zone
        </option>
        {ordered.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {invalid ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {errors![0]}
        </p>
      ) : null}
    </div>
  );
}
