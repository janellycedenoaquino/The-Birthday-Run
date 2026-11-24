import "server-only";
import { Sparkles } from "lucide-react";
import { msg, type MessageId } from "@/lib/messages";
import { getEntitlement } from "@/server/premium/entitlement";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database.types";

type Feature =
  "M-131" | "M-132" | "M-133" | "M-134" | "M-135" | "M-136" | "M-137" | "M-138";

// C-104 Upgrade prompt (SPEC §3.3, FR-39): an inline card where a premium feature would be.
// Never rendered for premium users. Payments off (FR-38): M-139, no button, no link. Payments
// on needs F-8's checkout form; until F-8 is built the card stays in its "coming soon" form.
export async function UpgradePrompt({
  supabase,
  feature,
  limit,
  compact = false,
}: {
  /** The page's own client, so getEntitlement's per-request cache answers (one RPC, F-7). */
  supabase: SupabaseClient<Database>;
  feature: Feature;
  limit?: number;
  compact?: boolean;
}) {
  const { premium } = await getEntitlement(supabase);
  if (premium) return null;
  const name = msg(feature as MessageId).replace(
    "{limit}",
    String(limit ?? ""),
  );
  const title = msg("M-130").replace("{feature}", name);
  // Payments are off everywhere until F-8 builds checkout; F-8 then shows M-140 and the button
  // when paymentsEnabled() is true. Until then the card can only say "coming soon" (FR-38).
  const body = msg("M-139");
  // S-110: the Settings card is already titled "Premium", so no second title (owner, 2026-11-24).
  if (feature === "M-138")
    return <p className="text-sm text-muted-foreground">{body}</p>;
  if (compact)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles aria-hidden="true" className="size-4" />
        <span>
          <span className="font-medium text-foreground">{title}.</span> {body}
        </span>
      </p>
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
      </div>
    </section>
  );
}
