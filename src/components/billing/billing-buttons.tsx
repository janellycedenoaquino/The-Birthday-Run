"use client";

import { usePathname } from "next/navigation";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";
import { msg, type MessageId } from "@/lib/messages";

type Action = (
  prev: ActionResult | null,
  formData: FormData,
) => Promise<ActionResult>;

// The two billing buttons (SPEC C-104, S-110; BUILD F-8). Each is a form whose server action
// redirects to Stripe; only rendered when payments are on (FR-38). Errors show inline.

function BillingError({ id }: { id: string | null }) {
  if (!id) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {msg(id as MessageId)}
    </p>
  );
}

const errorOf = (state: ActionResult | null) =>
  state && !state.ok ? (state.error === "API-4" ? "M-7" : state.error) : null;

/** C-104's "Upgrade to Premium" (M-141, pending M-142). BR-16 offers the portal (M-143). */
export function CheckoutButton({
  createCheckoutSession,
  createPortalSession,
  compact = false,
}: {
  createCheckoutSession: Action;
  createPortalSession: Action;
  compact?: boolean;
}) {
  const from = usePathname();
  const [state, action, pending] = useActionState(createCheckoutSession, null);
  const error = errorOf(state);
  return (
    <div className="grid justify-items-start gap-2">
      <form action={action}>
        <input type="hidden" name="from" value={from} />
        <Button
          type="submit"
          size={compact ? "sm" : "default"}
          disabled={pending}
        >
          {pending ? msg("M-142") : msg("M-141")}
        </Button>
      </form>
      <BillingError id={error} />
      {error === "BR-16" ? (
        <PortalButton createPortalSession={createPortalSession} />
      ) : null}
    </div>
  );
}

/** S-110's "Manage subscription" (M-143, pending "Opening…"). */
export function PortalButton({
  createPortalSession,
}: {
  createPortalSession: Action;
}) {
  const [state, action, pending] = useActionState(createPortalSession, null);
  return (
    <div className="grid justify-items-start gap-2">
      <form action={action}>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Opening…" : msg("M-143")}
        </Button>
      </form>
      <BillingError id={errorOf(state)} />
    </div>
  );
}
