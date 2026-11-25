"use client";

import { useActionState, useRef, useSyncExternalStore } from "react";
import { useFocusOnError } from "@/components/auth/form-alert";
import { FormAlert, formError } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { BirthdayFields } from "./birthday-fields";
import { TimeZoneSelect } from "./time-zone-select";

const noSubscribe = () => () => {};

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// S-101 step 1 (SPEC §3.3, F-2): month, day and the detected time zone. If the browser's zone
// isn't one the server knows (or JS is off), the required time-zone select shows instead.
export function OnboardingForm({
  saveOnboarding,
  zones,
  month,
  day,
}: {
  saveOnboarding: Action;
  zones: string[];
  month?: number | null;
  day?: number | null;
}) {
  const [state, action, pending] = useActionState(saveOnboarding, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);
  // The browser's zone: null on the server and in the first render, then the real value, with
  // no effect and no hydration mismatch. Only a zone the server knows counts as detected.
  const browserZone = useSyncExternalStore(
    noSubscribe,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => null,
  );
  // Sent as is: the server normalizes aliases, or refuses with BR-19 and the select shows.
  const detected = browserZone || null;

  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;
  const tzError = fieldErrors?.timeZone;

  return (
    // The prototype's look: bold labels, white 48 px selects, "Continue" on the right and faded
    // until both month and day are picked (the server still checks; decision 0016).
    <form
      ref={form}
      action={action}
      className="group/form grid gap-6 [&_label]:font-bold [&_select]:h-12 [&_select]:rounded-xl [&_select]:border-0 [&_select]:bg-white [&_select]:font-semibold [&_select]:text-[var(--navy)] [&_select]:shadow-[inset_0_0_0_1.5px_var(--border)] dark:[&_select]:bg-white/10 dark:[&_select]:text-foreground"
      noValidate
    >
      <input type="hidden" name="step" value="birthday" />
      <BirthdayFields
        month={month}
        day={day}
        dayErrors={fieldErrors?.day ?? fieldErrors?.month}
      />
      {detected && !tzError ? (
        <>
          <input type="hidden" name="timeZone" value={detected} />
          <p className="text-sm text-muted-foreground">
            {msg("M-107").replace("{timeZone}", detected.replaceAll("_", " "))}
          </p>
        </>
      ) : (
        <TimeZoneSelect zones={zones} errors={tzError} hint={msg("M-256")} />
      )}
      <FormAlert id={formError(state)} />
      <div className="flex justify-end">
        <Button
          type="submit"
          size="lg"
          disabled={pending}
          className="h-12 px-6 text-base group-has-[select:invalid]/form:opacity-50"
        >
          {pending ? "Saving…" : msg("M-108")}
        </Button>
      </div>
    </form>
  );
}
