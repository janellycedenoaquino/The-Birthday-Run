"use client";

import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// C-5 (SPEC §3.2): a password input with a Show/Hide toggle; paste allowed; no confirm field.
// `current` for sign-in and re-auth, `new` for choosing one (hint shown). Errors are the field's
// messages from the action (C-3), linked with aria-describedby.

export function PasswordField({
  name = "password",
  kind,
  errors,
  labelAside,
}: {
  name?: string;
  kind: "current" | "new";
  errors?: string[];
  /** Something beside the label, e.g. the "Forgot password?" link. */
  labelAside?: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [kind === "new" ? hintId : null, errors?.length ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <Label htmlFor={id}>Password</Label>
        {labelAside}
      </div>
      {/* Show/Hide sits inside the field's right end (decision 0016 look). */}
      <div className="relative">
        <Input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={kind === "new" ? "new-password" : "current-password"}
          required
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={describedBy}
          className="h-11 pr-[4.5rem]"
        />
        <button
          type="button"
          aria-pressed={shown}
          aria-controls={id}
          onClick={() => setShown((s) => !s)}
          className="absolute top-1/2 right-1.5 h-9 min-w-11 -translate-y-1/2 rounded-lg px-3 text-sm font-bold text-[var(--navy)] outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 dark:text-foreground"
        >
          {shown ? "Hide" : "Show"}
          <span className="sr-only"> password</span>
        </button>
      </div>
      {kind === "new" && (
        <p id={hintId} className="text-sm text-muted-foreground">
          At least 12 characters. A short phrase is easy to remember.
        </p>
      )}
      {errors?.length ? (
        <p id={errorId} className="text-sm text-destructive">
          {errors[0]}
        </p>
      ) : null}
    </div>
  );
}
