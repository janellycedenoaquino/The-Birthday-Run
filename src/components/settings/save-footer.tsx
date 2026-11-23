"use client";

import { FormAlert, formError } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

/** The end of a settings-style form (C-3): the form alert, then the submit button. */
export function SaveFooter({
  state,
  pending,
  label = "Save",
}: {
  state: ActionResult | null;
  pending: boolean;
  label?: string;
}) {
  return (
    <>
      <FormAlert id={formError(state)} />
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : label}
        </Button>
      </div>
    </>
  );
}
