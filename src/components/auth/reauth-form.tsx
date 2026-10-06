"use client";

import Link from "next/link";
import { useActionState, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { FormAlert, formError, useFocusOnError } from "./form-alert";
import { PasswordField } from "./password-field";
import { Turnstile } from "./turnstile";

// S-11's password path (SPEC §3.3, C-3, C-4, C-5). Works without hydration as a plain form post;
// Turnstile needs JavaScript, so without it the page says so (M-10). The server page passes the
// action in (client files never import src/server, BUILD §0.1).
export function ReauthForm({
  reauthenticate,
  email,
  next,
  nonce,
}: {
  reauthenticate: (
    prev: ActionResult | null,
    formData: FormData,
  ) => Promise<ActionResult>;
  email: string;
  next: string;
  nonce: string;
}) {
  const [state, action, pending] = useActionState(reauthenticate, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);

  return (
    <form ref={form} action={action} className="grid gap-5" noValidate>
      <noscript>
        <p role="alert" className="text-sm text-destructive">
          {msg("M-10")}
        </p>
      </noscript>
      <input type="hidden" name="next" value={next} />
      <p className="text-sm">
        Signed in as <span className="font-medium break-all">{email}</span>
      </p>
      <PasswordField
        kind="current"
        errors={state && !state.ok ? state.fieldErrors?.password : undefined}
        labelAside={
          <Link
            href="/forgot-password"
            className="text-sm underline underline-offset-4"
          >
            Forgot password?
          </Link>
        }
      />
      <Turnstile nonce={nonce} action="reauthenticate" formState={state} />
      <FormAlert id={formError(state)} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Checking…" : "Confirm"}
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link href="/settings">Cancel</Link>
        </Button>
      </div>
    </form>
  );
}
