"use client";

import { useActionState, useRef, useSyncExternalStore } from "react";
import { useFocusOnError } from "@/components/auth/form-alert";
import { SaveFooter } from "@/components/settings/save-footer";
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
}: {
  saveOnboarding: Action;
  zones: string[];
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
    <form ref={form} action={action} className="grid gap-6" noValidate>
      <input type="hidden" name="step" value="birthday" />
      <BirthdayFields dayErrors={fieldErrors?.day ?? fieldErrors?.month} />
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
      <SaveFooter state={state} pending={pending} label={msg("M-108")} />
    </form>
  );
}
