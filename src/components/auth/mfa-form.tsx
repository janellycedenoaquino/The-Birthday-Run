"use client";

import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { CodeField } from "./code-field";
import { FormAlert, formError, useFocusOnError } from "./form-alert";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// S-10's form (SPEC §3.3, FR-58): autofocus (one job); a wrong code clears and refocuses.
export function MfaForm({ verify, next }: { verify: Action; next: string }) {
  const [state, action, pending] = useActionState(verify, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);

  return (
    <form ref={form} action={action} className="grid gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <CodeField
        key={state ? JSON.stringify(state) : "code"}
        autoFocus
        errors={state && !state.ok ? state.fieldErrors?.code : undefined}
      />
      <FormAlert id={formError(state)} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Checking…" : "Verify"}
      </Button>
    </form>
  );
}
