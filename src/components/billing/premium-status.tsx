import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PortalButton } from "@/components/billing/billing-buttons";
import { UpgradePrompt } from "@/components/billing/upgrade-prompt";
import { formatDate, localDateOf } from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import type { Database } from "@/lib/types/database.types";
import { createPortalSession } from "@/server/actions/billing";
import { paymentsEnabled } from "@/server/billing/flag";

/** Statuses that give premium (D5); a paid user's row is in one of these. */
const PAID = new Set(["active", "past_due"]);

// S-110 Settings › Premium (SPEC §3.3: FR-35, FR-37). Free: C-104 (M-138). Premium by grant:
// M-261. Paid: M-262 (renews) or M-263 (ends) with the period's last day in the user's zone, and
// "Manage subscription" while payments are on (accepted in BUILD F-8: no portal while off).
export async function PremiumStatus({
  supabase,
  premium,
  timeZone,
}: {
  supabase: SupabaseClient<Database>;
  premium: boolean;
  timeZone: string | null;
}) {
  if (!premium) return <UpgradePrompt supabase={supabase} feature="M-138" />;
  const { data: sub, error } = await supabase
    .from("subscriptions")
    .select("status, current_period_end, cancel_at_period_end")
    .maybeSingle();
  if (error)
    throw new Error("S-110: could not read the subscription", { cause: error });
  if (!sub?.status || !PAID.has(sub.status) || !sub.current_period_end)
    return <p>{msg("M-261")}</p>;
  // past_due: Stripe is retrying a failed renewal, so the period's end has passed and neither
  // "renews on" nor "ends on" is true. Premium stays on (D5); say so, with the portal to fix it.
  if (sub.status === "past_due")
    return (
      <div className="grid gap-3">
        <p>{msg("M-261")}</p>
        {paymentsEnabled() ? (
          <PortalButton createPortalSession={createPortalSession} />
        ) : null}
      </div>
    );

  const date = formatDate(
    localDateOf(sub.current_period_end, timeZone ?? "UTC"),
    "long",
  );
  return (
    <div className="grid gap-3">
      <p>
        {msg(sub.cancel_at_period_end ? "M-263" : "M-262").replace(
          "{date}",
          date,
        )}
      </p>
      {paymentsEnabled() ? (
        <PortalButton createPortalSession={createPortalSession} />
      ) : null}
    </div>
  );
}
