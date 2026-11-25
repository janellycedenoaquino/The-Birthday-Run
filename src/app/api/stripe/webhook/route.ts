import type Stripe from "stripe";
import { getStripe } from "@/server/billing/stripe";
import { handleStripeEvent } from "@/server/billing/sync";
import { env } from "@/server/env";
import { logError } from "@/server/errors";

// POST /api/stripe/webhook (BUILD F-8, D8, NFR-8). `stripe` level: the signature on the raw body,
// else 400. Runs whatever the payments flag says (subscriptions can outlive a switch-off). The
// payload's state is never used: the handler reads the customer's subscriptions from Stripe.
// Sync failure → 500, so Stripe retries. Unlimited (§0.4): dropping retries would lose events.
export const dynamic = "force-dynamic";
// Stripe waits up to 20 s; the sync makes at most two Stripe calls (BUILD F-8).
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "private, no-store" };
const answer = (body: object, status = 200) =>
  Response.json(body, { status, headers: NO_STORE });

export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = env.STRIPE_WEBHOOK_SECRET;
  // Not configured: Stripe isn't sending to this app, so refuse without reading the body.
  if (!stripe || !secret) return answer({ error: "not_configured" }, 500);

  const signature = request.headers.get("stripe-signature");
  if (!signature) return answer({ error: "bad_signature" }, 400);
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    // A fixed message: the SDK's can quote part of the configured secret, and the body and
    // header are caller-controlled (rule 20).
    logError(new Error("stripe webhook: bad signature"), {
      op: "stripe.webhook.signature",
    });
    return answer({ error: "bad_signature" }, 400);
  }

  try {
    await handleStripeEvent(event, { stripe });
    return answer({ received: true });
  } catch (error) {
    logError(error, { op: "stripe.webhook" });
    return answer({ error: "failed" }, 500);
  }
}
