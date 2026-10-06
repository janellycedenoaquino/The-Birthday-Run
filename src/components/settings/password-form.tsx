"use client";

import { useActionState, useEffect, useRef } from "react";
import {
  FormAlert,
  formError,
  useFocusOnError,
} from "@/components/auth/form-alert";
import { PasswordField } from "@/components/auth/password-field";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { useSuccessToast } from "./use-success-toast";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// S-15's form (SPEC §3.3, FR-14): the new password only (D9: the recent sign-in is the check).
// The field clears after a success.
export function PasswordForm({ changePassword }: { changePassword: Action }) {
  const [state, action, pending] = useActionState(changePassword, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);
  useSuccessToast(state);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);

  return (
    <form ref={form} action={action} className="grid gap-4" noValidate>
      <PasswordField
        kind="new"
        errors={state && !state.ok ? state.fieldErrors?.password : undefined}
      />
      <FormAlert id={formError(state)} />
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Change password"}
        </Button>
      </div>
    </form>
  );
}
