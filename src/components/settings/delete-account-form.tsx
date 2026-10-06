"use client";

import { useActionState, useId, useRef, useState } from "react";
import {
  FormAlert,
  formError,
  useFocusOnError,
} from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// S-18's form (SPEC §3.3, FR-16): typing the email is the confirmation (no dialog). The button
// enables on a case-insensitive match as a convenience; the server checks again (D12).
export function DeleteAccountForm({
  deleteAccount,
  email,
}: {
  deleteAccount: Action;
  email: string;
}) {
  const [state, action, pending] = useActionState(deleteAccount, null);
  const [typed, setTyped] = useState("");
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);
  const id = useId();
  const errors = state && !state.ok ? state.fieldErrors?.email : undefined;
  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <form ref={form} action={action} className="grid gap-4" noValidate>
      <div className="grid gap-2">
        <Label htmlFor={id}>
          Type your email to confirm: <span className="break-all">{email}</span>
        </Label>
        <Input
          id={id}
          name="email"
          type="email"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          aria-invalid={errors?.length ? true : undefined}
          aria-describedby={errors?.length ? `${id}-error` : undefined}
          className="h-11"
        />
        {errors?.length ? (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {errors[0]}
          </p>
        ) : null}
      </div>
      <FormAlert id={formError(state)} />
      <div>
        <Button
          type="submit"
          size="lg"
          variant="destructive"
          disabled={pending || !matches}
        >
          {pending ? "Deleting…" : "Delete my account"}
        </Button>
      </div>
    </form>
  );
}
