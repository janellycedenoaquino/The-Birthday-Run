"use client";

import Link from "next/link";
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

// S-5 (SPEC §3.3, BUILD F-6, D10): email only; the password comes after verification. The server
// page passes the action in (client files never import src/server, BUILD §0.1).
export function SignUpForm({
  signUp,
  nonce,
}: {
  signUp: Action;
  nonce: string;
}) {
  const [state, action, pending] = useActionState(signUp, null);
  const [email, setEmail] = useState("");
  // The result "Try again" dismissed: the panel shows only for a newer M-1, never the old one
  // while a new submit is still pending.
  const [dismissed, setDismissed] = useState<typeof state>(null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);
  const emailId = useId();
  const errorId = `${emailId}-error`;

  if (state?.ok && state.message === "M-1" && state !== dismissed && !pending)
    return (
      <EmailSentPanel
        message="M-1"
        email={email}
        onTryAgain={() => setDismissed(state)}
      />
    );

  const fieldErrors = state && !state.ok ? state.fieldErrors?.email : undefined;

  return (
    <form ref={form} action={action} className="grid gap-5" noValidate>
      <noscript>
        <p role="alert" className="text-sm text-destructive">
          {msg("M-10")}
        </p>
      </noscript>
      <div className="grid gap-2">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={fieldErrors?.length ? true : undefined}
          aria-describedby={fieldErrors?.length ? errorId : undefined}
          className="h-11"
        />
        {fieldErrors?.length ? (
          <p id={errorId} className="text-sm text-destructive">
            {fieldErrors[0]}
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          We&apos;ll email you a link to confirm it&apos;s yours. You&apos;ll
          choose a password next.
        </p>
      </div>
      <Turnstile nonce={nonce} action="sign-up" formState={state} />
      <FormAlert id={formError(state)} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Continue"}
      </Button>
      <p className="text-sm text-muted-foreground">
        By continuing, you agree to our{" "}
        <Link href="/terms" className="underline underline-offset-4">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          Privacy Policy
        </Link>
        .
      </p>
    </form>
  );
}
