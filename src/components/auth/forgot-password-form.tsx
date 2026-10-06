"use client";

import { useActionState, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { EmailSentPanel } from "./email-sent-panel";
import { FormAlert, formError, useFocusOnError } from "./form-alert";
import { Turnstile } from "./turnstile";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// S-6's form (SPEC §3.3, BUILD F-8, FR-7): email + C-4, then the M-3 panel for every email.
export function ForgotPasswordForm({
  requestPasswordReset,
  nonce,
}: {
  requestPasswordReset: Action;
  nonce: string;
}) {
  const [state, action, pending] = useActionState(requestPasswordReset, null);
  const [email, setEmail] = useState("");
  const [dismissed, setDismissed] = useState<typeof state>(null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);
  const id = useId();
  const fieldErrors = state && !state.ok ? state.fieldErrors?.email : undefined;

  if (state?.ok && state.message === "M-3" && state !== dismissed && !pending)
    return (
      <EmailSentPanel
        message="M-3"
        email={email}
        onTryAgain={() => setDismissed(state)}
      />
    );

  return (
    <form ref={form} action={action} className="grid gap-5" noValidate>
      <noscript>
        <p role="alert" className="text-sm text-destructive">
          {msg("M-10")}
        </p>
      </noscript>
      <div className="grid gap-2">
        <Label htmlFor={id}>Email</Label>
        <Input
          id={id}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={fieldErrors?.length ? true : undefined}
          aria-describedby={fieldErrors?.length ? `${id}-error` : undefined}
          className="h-11"
        />
        {fieldErrors?.length ? (
          <p id={`${id}-error`} className="text-sm text-destructive">
            {fieldErrors[0]}
          </p>
        ) : null}
      </div>
      <Turnstile nonce={nonce} action="reset" formState={state} />
      <FormAlert id={formError(state)} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
