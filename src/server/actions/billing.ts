"use server";

import "server-only";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { safeRedirectPath } from "@/lib/security/safe-redirect";
import { nextSchema } from "@/lib/validation/auth";
import { parseForm } from "@/lib/validation/form";
import { requireOnboarded } from "@/server/auth/app-guards";
import { paymentsEnabled } from "@/server/billing/flag";
import { getStripe } from "@/server/billing/stripe";
import { ensureCustomer, syncCustomer } from "@/server/billing/sync";
import { env } from "@/server/env";
import { getEntitlement } from "@/server/premium/entitlement";
import { runAction } from "@/server/run-action";
import { rateLimit } from "@/server/security/rate-limit";
import { getSiteUrl } from "@/server/site-url";

// Billing actions (BUILD F-8: FR-37, FR-38, NFR-8, D8). Public endpoints: each validates and
// guards itself (rule 4). The payments flag is checked first, before any database or Stripe
// call, so with payments off they do nothing even when called directly (FR-38).

const checkoutSchema = z.object({ from: nextSchema }).strict();
const portalSchema = z.object({}).strict();
/** Only these mean "no subscription in progress", so a new checkout is allowed. */
const ENDED = new Set(["canceled", "incomplete_expired"]);

function stripeOrThrow() {
  const stripe = getStripe();
  // The env schema requires both when payments are on, so this only fails on a bad deploy.
  if (!stripe || !env.STRIPE_PRICE_ID)
    throw new Error("billing: payments are on but Stripe isn't configured");
  return { stripe, price: env.STRIPE_PRICE_ID };
}

/** C-104's "Upgrade to Premium": a Stripe Checkout session for the monthly price. */
export async function createCheckoutSession(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(checkoutSchema, formData);
  if (!input.ok) return input.result;
  if (!paymentsEnabled()) return { ok: false, error: "BR-15" };

  return runAction("createCheckoutSession", async () => {
    const { supabase, user } = await requireOnboarded();
    // A granted user never pays (FR-35): any premium answer refuses checkout.
    if ((await getEntitlement(supabase)).premium)
      return { ok: false, error: "BR-16" };
    const limit = await rateLimit("createCheckoutSession", { userId: user.id });
    if (!limit.ok) return limit;
    if (!user.email)
      throw new Error("createCheckoutSession: user has no email");

    const { stripe, price } = stripeOrThrow();
    const { customerId } = await ensureCustomer(
      { id: user.id, email: user.email },
      { stripe, supabase },
    );
    // Ask Stripe, not the row: a payment made moments ago (webhook not yet synced) or a
    // subscription still in progress (incomplete, unpaid…) must not get a second checkout and a
    // second charge. Any subscription that hasn't ended refuses with BR-16 and its portal link.
    const current = await syncCustomer(customerId, { stripe });
    if (current?.status && !ENDED.has(current.status))
      return { ok: false, error: "BR-16" };

    const site = getSiteUrl();
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      success_url: `${site}/billing/return`,
      cancel_url: `${site}${safeRedirectPath(input.data.from, "/rewards")}`,
    });
    if (!session.url) throw new Error("createCheckoutSession: no session URL");
    redirect(session.url);
  });
}

/** S-110's "Manage subscription" (and BR-16's link): the Stripe customer portal. */
export async function createPortalSession(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const input = parseForm(portalSchema, formData);
  if (!input.ok) return input.result;
  if (!paymentsEnabled()) return { ok: false, error: "BR-15" };

  return runAction("createPortalSession", async () => {
    const { supabase, user } = await requireOnboarded();
    const limit = await rateLimit("createPortalSession", { userId: user.id });
    if (!limit.ok) return limit;
    const { data: row, error } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error)
      throw new Error("createPortalSession: read failed", { cause: error });
    if (!row) return { ok: false, error: "BR-2" };

    const portal = await stripeOrThrow().stripe.billingPortal.sessions.create({
      customer: row.stripe_customer_id,
      return_url: `${getSiteUrl()}/settings#premium`,
    });
    redirect(portal.url);
  });
}
