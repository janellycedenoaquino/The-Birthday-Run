"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { FormAlert, formError, useFocusOnError } from "./form-alert";
import { PasswordField } from "./password-field";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// S-9's form (SPEC §3.3, BUILD F-6, C-3, C-5): the first password, no confirm field.
export function SetPasswordForm({
  setInitialPassword,
  next,
}: {
  setInitialPassword: Action;
  next: string;
}) {
  const [state, action, pending] = useActionState(setInitialPassword, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);

  return (
    <form ref={form} action={action} className="grid gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <PasswordField
        kind="new"
        errors={state && !state.ok ? state.fieldErrors?.password : undefined}
      />
      <FormAlert id={formError(state)} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save password"}
      </Button>
    </form>
  );
}
