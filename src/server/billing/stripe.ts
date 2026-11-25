import "server-only";
import Stripe from "stripe";
import { env } from "@/server/env";

// The Stripe client (BUILD F-8, §0.8 swappable layer: the unit tests pass a fake with the same
// few methods). The API version is the one `stripe` 23.2.0 pins, so the types match the answers.
// No key (payments off, never configured) → null; callers fail closed.

export const STRIPE_API_VERSION = "2026-11-18.endive";

let client: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!env.STRIPE_SECRET_KEY) return null;
  client ??= new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 10_000,
  });
  return client;
}

/** The few calls the app makes, so tests can pass a fake (BUILD §0.8). */
export type StripeApi = {
  customers: Pick<Stripe["customers"], "create" | "del">;
  subscriptions: Pick<Stripe["subscriptions"], "list" | "cancel">;
  checkout: { sessions: Pick<Stripe["checkout"]["sessions"], "create"> };
  billingPortal: {
    sessions: Pick<Stripe["billingPortal"]["sessions"], "create">;
  };
  webhooks: Pick<Stripe["webhooks"], "constructEvent">;
};
