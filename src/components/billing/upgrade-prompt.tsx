import "server-only";
import { Sparkles } from "lucide-react";
import { msg, type MessageId } from "@/lib/messages";
import { CheckoutButton } from "@/components/billing/billing-buttons";
import {
  createCheckoutSession,
  createPortalSession,
} from "@/server/actions/billing";
import { paymentsEnabled } from "@/server/billing/flag";
import { getEntitlement } from "@/server/premium/entitlement";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

type Feature =
  "M-131" | "M-132" | "M-133" | "M-134" | "M-135" | "M-136" | "M-137" | "M-138";

// C-104 Upgrade prompt (SPEC §3.3, FR-39): an inline card where a premium feature would be.
// Never rendered for premium users. Payments off (FR-38): M-139, no button, no link. Payments
// on (F-8): M-140 and the checkout button.
export async function UpgradePrompt({
  supabase,
  feature,
  limit,
  compact = false,
  tag = false,
}: {
  /** The page's own client, so getEntitlement's per-request cache answers (one RPC, F-7). */
  supabase: SupabaseClient<Database>;
  feature: Feature;
  limit?: number;
  compact?: boolean;
  /** S-103's small pink-ringed tag (decision 0016 prototype): M-131a, then the button if on. */
  tag?: boolean;
}) {
  const { premium } = await getEntitlement(supabase);
  if (premium) return null;
  const name = msg(feature as MessageId).replace(
    "{limit}",
    String(limit ?? ""),
  );
  const title = msg("M-130").replace("{feature}", name);
  const payments = paymentsEnabled();
  const body = msg(payments ? "M-140" : "M-139");
  const button = payments ? (
    <CheckoutButton
      createCheckoutSession={createCheckoutSession}
      createPortalSession={createPortalSession}
      compact={compact}
    />
  ) : null;
  if (tag)
    return (
      <span className="flex flex-wrap items-center gap-2">
        <span className="rounded-[10px] bg-white/70 px-3 py-2 text-[13px] font-bold text-[var(--navy)] shadow-[inset_0_0_0_1.5px_var(--bubblegum)] dark:bg-white/10 dark:text-foreground">
          {msg("M-131a")}
        </span>
        {button}
      </span>
    );
  // S-110: the Settings card is already titled "Premium", so no second title (owner, 2026-11-24).
  const text =
    feature === "M-138" ? (
      <p className="text-sm text-muted-foreground">{body}</p>
    ) : compact ? (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles aria-hidden="true" className="size-4" />
        <span>
          <span className="font-medium text-foreground">{title}.</span> {body}
        </span>
      </p>
    ) : null;
  // Payments off: the text alone, with no control (FR-38).
  if (text)
    return button ? (
      <div className="grid gap-2">
        {text}
        {button}
      </div>
    ) : (
      text
    );
  return (
    <section
      className="flex gap-3 rounded-lg border border-border/70 p-4"
      aria-label={title}
    >
      <Sparkles
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
      />
      <div className="grid gap-1">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{body}</p>
        {button ? <div className="mt-2">{button}</div> : null}
      </div>
    </section>
  );
}
