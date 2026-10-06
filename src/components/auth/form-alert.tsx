"use client";

import { useEffect, useRef, type RefObject } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/action-result";
import { msg, type MessageId } from "@/lib/messages";

// C-3 form errors (SPEC §3.2): a destructive Alert above submit, `role="alert"`, and after each
// failed submit focus goes to the first invalid field, else to the alert.

export function FormAlert({ id }: { id: string | null }) {
  if (!id) return null;
  return (
    <Alert variant="destructive" role="alert" tabIndex={-1} data-form-alert="">
      <AlertDescription>{msg(id as MessageId)}</AlertDescription>
    </Alert>
  );
}

/** The alert's message ID for a result: none for success or for field-only (API-4) errors. */
export const formError = (state: ActionResult<unknown> | null) =>
  state && !state.ok && state.error !== "API-4" ? state.error : null;

export function useFocusOnError(
  state: ActionResult<unknown> | null,
  form: RefObject<HTMLFormElement | null>,
) {
  const first = useRef(state);
  useEffect(() => {
    if (state === first.current || !state || state.ok || !form.current) return;
    const target =
      form.current.querySelector<HTMLElement>('[aria-invalid="true"]') ??
      form.current.querySelector<HTMLElement>("[data-form-alert]");
    target?.focus();
  }, [state, form]);
}
