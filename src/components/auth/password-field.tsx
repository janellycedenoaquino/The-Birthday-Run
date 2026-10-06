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
      <div className="flex gap-2">
        <Input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          autoComplete={kind === "new" ? "new-password" : "current-password"}
          required
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={describedBy}
          className="h-11"
        />
        <button
          type="button"
          aria-pressed={shown}
          aria-controls={id}
          onClick={() => setShown((s) => !s)}
          className="h-11 min-w-11 shrink-0 rounded-md border border-input px-3 text-sm outline-none hover:bg-muted focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
