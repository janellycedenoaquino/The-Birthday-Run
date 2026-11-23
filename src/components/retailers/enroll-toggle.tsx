"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { msg, type MessageId } from "@/lib/messages";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// C-102's toggle (SPEC §3.3, F-3): a plain form posting `enroll` or `unenroll`, so it works
// without JS. While the request runs the button already shows the new state; on an error it
// goes back and the message shows on the card. The parent re-renders with the saved state.
export function EnrollToggle({
  retailerId,
  name,
  enrolled,
  enroll,
  unenroll,
}: {
  retailerId: string;
  name: string;
  enrolled: boolean;
  enroll: Action;
  unenroll: Action;
}) {
  // A new form (fresh action state) whenever the saved state flips.
  return (
    <ToggleForm
      key={String(enrolled)}
      retailerId={retailerId}
      name={name}
      enrolled={enrolled}
      action={enrolled ? unenroll : enroll}
    />
  );
}

// The toggle that was just pressed, so its replacement (a fresh form once the saved state flips)
// gets keyboard focus back (WCAG 2.4.3). Client-only, one tab's own state.
let lastPressed: string | null = null;

function ToggleForm({
  retailerId,
  name,
  enrolled,
  action: run,
}: {
  retailerId: string;
  name: string;
  enrolled: boolean;
  action: Action;
}) {
  const [state, action] = useActionState(run, null);
  const error = state && !state.ok ? state.error : null;
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (lastPressed !== retailerId) return;
    lastPressed = null;
    form.current?.querySelector("button")?.focus();
  }, [retailerId]);
  return (
    <form
      ref={form}
      action={action}
      onSubmit={() => {
        lastPressed = retailerId;
      }}
      className="grid gap-1"
    >
      <input type="hidden" name="retailerId" value={retailerId} />
      <ToggleButton name={name} enrolled={enrolled} />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {msg(error as MessageId)}
        </p>
      ) : null}
    </form>
  );
}

function ToggleButton({ name, enrolled }: { name: string; enrolled: boolean }) {
  const { pending } = useFormStatus();
  const on = pending ? !enrolled : enrolled; // optimistic while saving
  return (
    <Button
      type="submit"
      size="sm"
      variant={on ? "secondary" : "default"}
      aria-pressed={on}
      // One name; aria-pressed carries the state, so it isn't announced twice (C-102).
      aria-label={`${msg("M-103")} ${name}`}
      disabled={pending}
    >
      {msg(on ? "M-104" : "M-103")}
    </Button>
  );
}
