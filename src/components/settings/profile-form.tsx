"use client";

import { useActionState, useId, useRef } from "react";
import {
  FormAlert,
  formError,
  useFocusOnError,
} from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import { useSuccessToast } from "./use-success-toast";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// S-14's display-name form (SPEC §3.3, FR-12). Rendered and saved as text only.
export function ProfileForm({
  updateDisplayName,
  displayName,
}: {
  updateDisplayName: Action;
  displayName: string | null;
}) {
  const [state, action, pending] = useActionState(updateDisplayName, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);
  useSuccessToast(state);
  const id = useId();
  const errors =
    state && !state.ok ? state.fieldErrors?.displayName : undefined;
  const describedBy = [`${id}-hint`, errors?.length ? `${id}-error` : null]
    .filter(Boolean)
    .join(" ");

  return (
    <form ref={form} action={action} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor={id}>Display name</Label>
        <Input
          id={id}
          name="displayName"
          autoComplete="name"
          defaultValue={displayName ?? ""}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={describedBy}
          className="h-11"
        />
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          Shown on your dashboard.
        </p>
        {errors?.length ? (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {errors[0]}
          </p>
        ) : null}
      </div>
      <FormAlert id={formError(state)} />
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}
