"use client";

import { useActionState, useRef } from "react";
import { useFocusOnError } from "@/components/auth/form-alert";
import { useSuccessToast } from "@/components/settings/use-success-toast";
import { SaveFooter } from "@/components/settings/save-footer";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { BirthdayFields } from "./birthday-fields";
import { TimeZoneSelect } from "./time-zone-select";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// S-108 Settings › Birthday (SPEC §3.3, F-2): two forms in one card, one action each.
export function BirthdayCard({
  updateBirthday,
  updateTimeZone,
  month,
  day,
  timeZone,
  zones,
}: {
  updateBirthday: Action;
  updateTimeZone: Action;
  month: number | null;
  day: number | null;
  timeZone: string | null;
  zones: string[];
}) {
  return (
    <div className="grid gap-8">
      <SubForm action={updateBirthday}>
        {(errors) => (
          <BirthdayFields
            month={month}
            day={day}
            dayErrors={errors?.day ?? errors?.month}
          />
        )}
      </SubForm>
      <SubForm action={updateTimeZone}>
        {(errors) => (
          <TimeZoneSelect
            zones={zones}
            value={timeZone}
            errors={errors?.timeZone}
            hint={msg("M-256")}
          />
        )}
      </SubForm>
    </div>
  );
}

function SubForm({
  action: run,
  children,
}: {
  action: Action;
  children: (errors: Record<string, string[]> | undefined) => React.ReactNode;
}) {
  const [state, action, pending] = useActionState(run, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);
  useSuccessToast(state);
  const errors = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form ref={form} action={action} className="grid gap-4" noValidate>
      {children(errors)}
      <SaveFooter state={state} pending={pending} />
    </form>
  );
}
