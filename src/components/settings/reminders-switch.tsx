"use client";

import { useActionState, useId } from "react";
import { FormAlert, formError } from "@/components/auth/form-alert";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { useSuccessToast } from "./use-success-toast";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// S-109 Settings › Reminders (FR-41, FR-42, premium): one switch. It's a submit button with
// role="switch", so it also works without JavaScript; the server answers with M-259 / M-260.
export function RemindersSwitch({
  enabled,
  setReminders,
}: {
  enabled: boolean;
  setReminders: Action;
}) {
  const [state, action, pending] = useActionState(setReminders, null);
  useSuccessToast(state);
  const id = useId();
  // After a save the page re-renders with the stored value; until then, show what was asked.
  const on = state?.ok && state.message ? state.message === "M-259" : enabled;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="enabled" value={on ? "off" : "on"} />
      <div className="flex items-center justify-between gap-4">
        <span id={`${id}-label`} className="font-medium">
          Birthday reminder emails
        </span>
        <button
          type="submit"
          role="switch"
          aria-checked={on}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-help`}
          disabled={pending}
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60 ${on ? "bg-primary" : "bg-input"}`}
        >
          <span
            aria-hidden="true"
            className={`inline-block size-6 rounded-full bg-background shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`}
          />
        </button>
      </div>
      <p id={`${id}-help`} className="text-sm text-muted-foreground">
        {msg("M-258")}
      </p>
      <FormAlert id={formError(state)} />
    </form>
  );
}
