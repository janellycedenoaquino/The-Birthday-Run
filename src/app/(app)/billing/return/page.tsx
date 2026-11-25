import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { msg } from "@/lib/messages";
import { requireOnboarded } from "@/server/auth/app-guards";
import { paymentsEnabled } from "@/server/billing/flag";
import { getEntitlement } from "@/server/premium/entitlement";

// S-111 Payment return (SPEC §3.3: FR-37, NFR-8). Stripe Checkout's success URL. It never turns
// premium on and never writes: only the signed webhook does (D8). It reads the entitlement, so
// "Check again" (a reload) shows M-266 once the webhook has synced.
export const metadata: Metadata = {
  title: "Payment",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

export default async function BillingReturnPage() {
  const { supabase } = await requireOnboarded();
  const premium = paymentsEnabled()
    ? (await getEntitlement(supabase)).premium
    : false;
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">{msg("M-264")}</h1>
      {!paymentsEnabled() ? (
        <p className="mt-4">{msg("M-139")}</p>
      ) : premium ? (
        <p className="mt-4" role="status">
          {msg("M-266")}
        </p>
      ) : (
        <p className="mt-4" role="status">
          {msg("M-265")}
        </p>
      )}
      <div className="mt-6 flex flex-wrap gap-2">
        {paymentsEnabled() && !premium ? (
          <Button asChild variant="outline" size="lg">
            {/* A plain link: a full reload re-reads the entitlement. */}
            <a href="/billing/return">Check again</a>
          </Button>
        ) : null}
        <Button asChild size="lg">
          <Link href="/rewards">Go to My Rewards</Link>
        </Button>
      </div>
    </div>
  );
}
