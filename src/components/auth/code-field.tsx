"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// The 6-digit code input (SPEC S-10, S-16): one field, not six boxes; numeric keyboard, OS code
// autofill, paste allowed (WCAG 3.3.8).
export function CodeField({
  label = "6-digit code",
  errors,
  autoFocus = false,
}: {
  label?: string;
  errors?: string[];
  autoFocus?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name="code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]*"
        required
        autoFocus={autoFocus}
        aria-invalid={errors?.length ? true : undefined}
        aria-describedby={errors?.length ? `${id}-error` : undefined}
        className="h-11 max-w-48 font-mono tracking-widest"
      />
      {errors?.length ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
