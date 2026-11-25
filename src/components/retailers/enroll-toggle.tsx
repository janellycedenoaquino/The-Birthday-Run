"use client";

import { useActionState, useEffect, useRef } from "react";
import { Check, Plus } from "lucide-react";
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
  compact = false,
  wide = false,
}: {
  retailerId: string;
  name: string;
  enrolled: boolean;
  enroll: Action;
  unenroll: Action;
  /** Discover's card corner (decision 0016): a 34 px "+" (a check once added). */
  compact?: boolean;
  /** S-104 (decision 0016): "Add to My Rewards" / "Added to My Rewards". */
  wide?: boolean;
}) {
  // A new form (fresh action state) whenever the saved state flips.
  return (
    <ToggleForm
      key={String(enrolled)}
      retailerId={retailerId}
      name={name}
      enrolled={enrolled}
      action={enrolled ? unenroll : enroll}
      compact={compact}
      wide={wide}
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
  compact,
  wide,
}: {
  retailerId: string;
  name: string;
  enrolled: boolean;
  action: Action;
  compact: boolean;
  wide: boolean;
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
      className={compact ? "relative" : "grid gap-1"}
    >
      <input type="hidden" name="retailerId" value={retailerId} />
      <ToggleButton
        name={name}
        enrolled={enrolled}
        compact={compact}
        wide={wide}
      />
      {error ? (
        <p
          role="alert"
          className={
            compact
              ? "absolute right-0 bottom-full mb-2 w-52 rounded-lg bg-background p-2 text-sm text-destructive shadow-[0_0_0_1.5px_var(--border)]"
              : "text-sm text-destructive"
          }
        >
          {msg(error as MessageId)}
        </p>
      ) : null}
    </form>
  );
}

function ToggleButton({
  name,
  enrolled,
  compact,
  wide,
}: {
  name: string;
  enrolled: boolean;
  compact: boolean;
  wide: boolean;
}) {
  const { pending } = useFormStatus();
  const on = pending ? !enrolled : enrolled; // optimistic while saving
  if (compact) {
    const Icon = on ? Check : Plus;
    return (
      <button
        type="submit"
        aria-pressed={on}
        aria-label={`${msg("M-103")} ${name}`}
        disabled={pending}
        className={`grid size-[34px] place-items-center rounded-[10px] text-[var(--navy)] shadow-[0_0_0_1.5px_var(--navy)] outline-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[var(--navy)] disabled:opacity-70 ${on ? "bg-[var(--spring)]" : "bg-white"}`}
      >
        <Icon className="size-5" strokeWidth={2.75} aria-hidden="true" />
      </button>
    );
  }
  if (wide) {
    const Icon = on ? Check : Plus;
    return (
      <Button
        type="submit"
        size="lg"
        aria-pressed={on}
        aria-label={`${msg("M-103")} ${name}`}
        disabled={pending}
        className={`h-11 px-4 ${on ? "bg-[var(--spring)]" : ""}`}
      >
        <Icon aria-hidden="true" />
        {msg(on ? "M-298c" : "M-298b")}
      </Button>
    );
  }
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
