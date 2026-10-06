"use client";

import Link from "next/link";
import { useActionState, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { EmailSentPanel } from "./email-sent-panel";
import { FormAlert, formError, useFocusOnError } from "./form-alert";
import { PasswordField } from "./password-field";
import { Turnstile } from "./turnstile";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// S-4's two tabs (SPEC §3.3, BUILD F-7): Password (FR-3) and Email link (FR-4). Radix unmounts the
// inactive tab, so only the active one renders its C-4. No autofocus (SPEC S-4).
export function SignInForms({
  signIn,
  requestMagicLink,
  next,
  nonce,
}: {
  signIn: Action;
  requestMagicLink: Action;
  next?: string;
  nonce: string;
}) {
  return (
    <Tabs defaultValue="password" className="gap-6">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="password">Password</TabsTrigger>
        <TabsTrigger value="link">Email link</TabsTrigger>
      </TabsList>
      <TabsContent value="password">
        <PasswordTab signIn={signIn} next={next} nonce={nonce} />
      </TabsContent>
      <TabsContent value="link">
        <LinkTab
          requestMagicLink={requestMagicLink}
          next={next}
          nonce={nonce}
        />
      </TabsContent>
    </Tabs>
  );
}

function EmailField({
  value,
  onChange,
  errors,
}: {
  value?: string;
  onChange?: (value: string) => void;
  errors?: string[];
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Email</Label>
      <Input
        id={id}
        name="email"
        type="email"
        autoComplete="email"
        required
        {...(onChange && { value, onChange: (e) => onChange(e.target.value) })}
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
  );
}

const noScript = (
  <noscript>
    <p role="alert" className="text-sm text-destructive">
      {msg("M-10")}
    </p>
  </noscript>
);

function PasswordTab({
  signIn,
  next,
  nonce,
}: {
  signIn: Action;
  next?: string;
  nonce: string;
}) {
  const [state, action, pending] = useActionState(signIn, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);
  const fields = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form ref={form} action={action} className="grid gap-5" noValidate>
      {noScript}
      {next && <input type="hidden" name="next" value={next} />}
      <EmailField errors={fields?.email} />
      <PasswordField
        kind="current"
        errors={fields?.password}
        labelAside={
          <Link
            href="/forgot-password"
            className="text-sm underline underline-offset-4"
          >
            Forgot password?
          </Link>
        }
      />
      <Turnstile nonce={nonce} action="sign-in" formState={state} />
      <FormAlert id={formError(state)} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function LinkTab({
  requestMagicLink,
  next,
  nonce,
}: {
  requestMagicLink: Action;
  next?: string;
  nonce: string;
}) {
  const [state, action, pending] = useActionState(requestMagicLink, null);
  const [email, setEmail] = useState("");
  const [dismissed, setDismissed] = useState<typeof state>(null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);

  if (state?.ok && state.message === "M-2" && state !== dismissed && !pending)
    return (
      <EmailSentPanel
        message="M-2"
        email={email}
        onTryAgain={() => setDismissed(state)}
      />
    );

  return (
    <form ref={form} action={action} className="grid gap-5" noValidate>
      {noScript}
      {next && <input type="hidden" name="next" value={next} />}
      <p className="text-sm text-muted-foreground">
        We&apos;ll email you a link that signs you in. No password needed.
      </p>
      <EmailField
        value={email}
        onChange={setEmail}
        errors={state && !state.ok ? state.fieldErrors?.email : undefined}
      />
      <Turnstile nonce={nonce} action="magic-link" formState={state} />
      <FormAlert id={formError(state)} />
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Sending…" : "Email me a link"}
      </Button>
    </form>
  );
}
