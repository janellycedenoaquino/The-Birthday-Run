"use client";

import { useActionState } from "react";
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
  return (
    <form action={action} className="grid gap-1">
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
      aria-label={`${msg(on ? "M-104" : "M-103")}: ${name}`}
      disabled={pending}
    >
      {msg(on ? "M-104" : "M-103")}
    </Button>
  );
}
