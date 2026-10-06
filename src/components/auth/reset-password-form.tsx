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

// S-7's form (SPEC §3.3, BUILD F-8, FR-8): the new password, no confirm field (C-5).
export function ResetPasswordForm({
  updatePassword,
}: {
  updatePassword: Action;
}) {
  const [state, action, pending] = useActionState(updatePassword, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);

  return (
    <form ref={form} action={action} className="grid gap-5" noValidate>
      <PasswordField
        kind="new"
        errors={state && !state.ok ? state.fieldErrors?.password : undefined}
      />
      <FormAlert id={formError(state)} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
