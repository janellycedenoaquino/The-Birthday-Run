"use client";

import { useActionState, useRef, useState } from "react";
import { toast } from "sonner";
import { CodeField } from "@/components/auth/code-field";
import {
  FormAlert,
  formError,
  useFocusOnError,
} from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { msg } from "@/lib/messages";
import { useSuccessToast } from "./use-success-toast";

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
  uri: string;
};
type Action<T = void> = (
  prev: ActionResult<T> | null,
  formData: FormData,
) => Promise<ActionResult<T>>;

// S-16 (SPEC §3.3, FR-57, FR-59, D24.21, D24.22): off → set up inline (no modal) → on; turning it
// off needs a current code. Rendered only when the sign-in is recent (the page shows the gate).
export function TwoStepCard({
  enabled,
  start,
  confirm,
  disable,
}: {
  enabled: boolean;
  start: Action<Enrollment>;
  confirm: Action;
  disable: Action;
}) {
  return enabled ? (
    <TurnOff disable={disable} />
  ) : (
    <TurnOn start={start} confirm={confirm} />
  );
}

function TurnOn({
  start,
  confirm,
}: {
  start: Action<Enrollment>;
  confirm: Action;
}) {
  const [setup, startAction, starting] = useActionState(start, null);
  const [cancelled, setCancelled] = useState<typeof setup>(null);
  const enrollment = setup?.ok && setup !== cancelled ? setup.data : undefined;

  if (!enrollment)
    return (
      <form action={startAction} className="grid gap-4">
        <p>
          Two-step sign-in is off. Turn it on to enter a code from an
          authenticator app each time you sign in.
        </p>
        <FormAlert id={formError(setup)} />
        <div>
          <Button type="submit" size="lg" disabled={starting}>
            {starting ? "Preparing…" : "Set up two-step sign-in"}
          </Button>
        </div>
      </form>
    );
  return (
    <Setup
      enrollment={enrollment}
      confirm={confirm}
      onCancel={() => setCancelled(setup)}
    />
  );
}

function Setup({
  enrollment,
  confirm,
  onCancel,
}: {
  enrollment: Enrollment;
  confirm: Action;
  onCancel: () => void;
}) {
  const [state, action, pending] = useActionState(confirm, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);
  useSuccessToast(state);
  const grouped =
    enrollment.secret.match(/.{1,4}/g)?.join(" ") ?? enrollment.secret;

  return (
    <form ref={form} action={action} className="grid gap-5">
      <input type="hidden" name="factorId" value={enrollment.factorId} />
      <p>1. Scan this QR code with an authenticator app.</p>
      <div className="flex flex-wrap items-center gap-4">
        {/* An SVG data URI from Supabase's response (img-src data:, D8); a white box scans in
            dark mode too. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- a data URI, nothing to optimise */}
        <img
          src={enrollment.qrCode}
          alt="QR code for setting up two-step sign-in"
          width={180}
          height={180}
          className="rounded-md bg-white p-2"
        />
        {/* The otpauth:// URI comes from Supabase, never input (D24.22). */}
        <a
          href={enrollment.uri}
          className="text-sm underline underline-offset-4"
        >
          Open in authenticator app
        </a>
      </div>
      <div className="grid gap-2">
        <p className="text-sm">Can&apos;t scan it? Enter this key instead:</p>
        <div className="flex flex-wrap items-center gap-3">
          <code className="rounded bg-muted px-2 py-1 font-mono text-sm break-all">
            {grouped}
          </code>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(enrollment.secret);
              toast.success(msg("M-18"));
            }}
          >
            Copy
          </Button>
        </div>
      </div>
      <p>2. Enter the 6-digit code the app shows.</p>
      <CodeField
        errors={state && !state.ok ? state.fieldErrors?.code : undefined}
      />
      <p className="text-sm text-muted-foreground">
        If you lose your authenticator app, you&apos;ll need to contact support
        to get back into your account.
      </p>
      <FormAlert id={formError(state)} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Checking…" : "Turn on"}
        </Button>
        <Button type="button" size="lg" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TurnOff({ disable }: { disable: Action }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(disable, null);
  const form = useRef<HTMLFormElement>(null);
  useFocusOnError(state, form);
  useSuccessToast(state);

  return (
    <div className="grid gap-4">
      <p>
        Two-step sign-in is on. You&apos;ll enter a code from your authenticator
        app when you sign in.
      </p>
      {open ? (
        <form ref={form} action={action} className="grid gap-4">
          <CodeField
            label="Enter a current code to turn it off"
            errors={state && !state.ok ? state.fieldErrors?.code : undefined}
          />
          <FormAlert id={formError(state)} />
          <div>
            <Button
              type="submit"
              size="lg"
              variant="destructive"
              disabled={pending}
            >
              {pending ? "Turning off…" : "Turn off"}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => setOpen(true)}
          >
            Turn off two-step sign-in
          </Button>
        </div>
      )}
    </div>
  );
}
