import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { isoDaysBefore, isoFromUnix } from "@/lib/birthday/timing";
import type { Database } from "@/lib/types/database.types";
import { logError } from "@/server/errors";
import { getAdminClient } from "@/server/supabase/admin";
import type { StripeApi } from "./stripe";

// The billing module (BUILD F-8, §0.8, D8, FR-37, NFR-8). Every write to `subscriptions` and
// `stripe_events` happens here, with the admin client (the only billing file that gets it; tests
// pass a fake). A webhook event is only a nudge: its
// payload is never trusted, the current state is always read back from Stripe (D8). The user ↔
// customer mapping comes only from the `subscriptions` row that ensureCustomer inserts (T-102).

type Admin = SupabaseClient<Database>;
type Deps = { stripe: StripeApi; admin?: Admin };
export type Snapshot = Database["public"]["Tables"]["subscriptions"]["Row"];

/** The events the webhook endpoint subscribes to (BUILD F-8 Flow, webhook step 2). */
export const HANDLED_EVENTS = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "invoice.paid",
  "invoice.payment_failed",
]);

/** Which subscription is "the" one: by this status order, then newest (BUILD F-8, sync 5.2). */
const STATUS_RANK = [
  "active",
  "past_due",
  "unpaid",
  "trialing",
  "incomplete",
  "paused",
  "canceled",
  "incomplete_expired",
];
const ENDED = new Set(["canceled", "incomplete_expired"]);
/** A-20: event IDs kept this long, then pruned. */
const EVENT_RETENTION_DAYS = 30;

function currentSubscription(
  subs: Stripe.Subscription[],
): Stripe.Subscription | null {
  const rank = (s: Stripe.Subscription) => {
    const i = STATUS_RANK.indexOf(s.status);
    return i === -1 ? STATUS_RANK.length : i;
  };
  return (
    [...subs].sort((a, b) => rank(a) - rank(b) || b.created - a.created)[0] ??
    null
  );
}

/**
 * The caller's Stripe Customer, creating it and their `subscriptions` row on first checkout. Two
 * checkouts at once: one row wins (on conflict do nothing), and the losing Customer is deleted.
 */
export async function ensureCustomer(
  user: { id: string; email: string },
  {
    stripe,
    admin = getAdminClient(),
    supabase,
  }: Deps & { supabase: SupabaseClient<Database> },
): Promise<{ customerId: string; status: string | null }> {
  const own = await supabase
    .from("subscriptions")
    .select("stripe_customer_id, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (own.error)
    throw new Error("ensureCustomer: read failed", { cause: own.error });
  if (own.data)
    return { customerId: own.data.stripe_customer_id, status: own.data.status };

  const created = await stripe.customers.create({
    email: user.email,
    metadata: { user_id: user.id },
  });
  const insert = await admin
    .from("subscriptions")
    .upsert(
      { user_id: user.id, stripe_customer_id: created.id, status: null },
      { onConflict: "user_id", ignoreDuplicates: true },
    );
  if (insert.error)
    throw new Error("ensureCustomer: insert failed", { cause: insert.error });
  const stored = await admin
    .from("subscriptions")
    .select("stripe_customer_id, status")
    .eq("user_id", user.id)
    .single();
  if (stored.error)
    throw new Error("ensureCustomer: re-read failed", { cause: stored.error });
  if (stored.data.stripe_customer_id !== created.id)
    // Another request won the race: drop ours (best effort; an orphan Customer costs nothing).
    await stripe.customers
      .del(created.id)
      .catch((error: unknown) =>
        logError(error, { op: "ensureCustomer.dropDuplicate" }),
      );
  return {
    customerId: stored.data.stripe_customer_id,
    status: stored.data.status,
  };
}

/** Reads the customer's subscriptions from Stripe and stores the current one. Never inserts. */
export async function syncCustomer(
  customerId: string,
  { stripe, admin = getAdminClient(), now }: Deps & { now?: Date },
): Promise<Snapshot | null> {
  const row = await admin
    .from("subscriptions")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (row.error)
    throw new Error("syncCustomer: read failed", { cause: row.error });
  // Unknown customer: a deleted account, or not ours. Never create a row from an event (T-117).
  if (!row.data) return null;

  const list = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });
  // Stamped after the read: two syncs at once (checkout sends several events) each write only
  // if nothing read later has been stored, so an older read never overwrites a newer one.
  const readAt = (now ?? new Date()).toISOString();
  const sub = currentSubscription(list.data);
  const periodEnd = sub?.items.data[0]?.current_period_end;
  // A scheduled cancel (`cancel_at`, set in the dashboard or API) also "ends" the subscription,
  // on that date if it comes before the period's end.
  const endsAt =
    sub?.cancel_at && (!periodEnd || sub.cancel_at < periodEnd)
      ? sub.cancel_at
      : periodEnd;
  const { data, error } = await admin
    .from("subscriptions")
    .update({
      stripe_subscription_id: sub?.id ?? null,
      status: sub?.status ?? null,
      current_period_end: endsAt ? isoFromUnix(endsAt) : null,
      cancel_at_period_end: Boolean(
        sub?.cancel_at_period_end || sub?.cancel_at,
      ),
      synced_at: readAt,
    })
    .eq("stripe_customer_id", customerId)
    .lt("synced_at", readAt)
    .select()
    .maybeSingle();
  if (error) throw new Error("syncCustomer: update failed", { cause: error });
  if (data) return data;
  // A newer read was stored first: keep it.
  const stored = await admin
    .from("subscriptions")
    .select()
    .eq("stripe_customer_id", customerId)
    .single();
  if (stored.error)
    throw new Error("syncCustomer: re-read failed", { cause: stored.error });
  return stored.data;
}

/** The customer ID an event is about, from its object (a string or an expanded object). */
function customerOf(event: Stripe.Event): string | null {
  const c = (event.data.object as { customer?: unknown }).customer;
  const id =
    typeof c === "string"
      ? c
      : c && typeof c === "object" && "id" in c
        ? (c as { id: unknown }).id
        : null;
  return typeof id === "string" && /^cus_\w+$/.test(id) ? id : null;
}

export async function handleStripeEvent(
  event: Stripe.Event,
  deps: Deps & { now?: Date },
): Promise<{ status: "ignored" | "duplicate" | "synced" }> {
  if (!HANDLED_EVENTS.has(event.type)) return { status: "ignored" };
  const customerId = customerOf(event);
  if (!customerId) {
    logError(new Error(`stripe webhook: ${event.type} without a customer`), {
      op: "stripe.webhook",
    });
    return { status: "ignored" };
  }

  const admin = deps.admin ?? getAdminClient();
  // Decision 0021: an event ID is recorded only after its sync succeeded, so it only skips work
  // already done. A run killed mid-sync leaves nothing behind and Stripe's retry syncs again;
  // two deliveries at once both sync, which is harmless (sync is idempotent, D8).
  const seen = await admin
    .from("stripe_events")
    .select("id")
    .eq("id", event.id)
    .maybeSingle();
  if (seen.error)
    throw new Error("handleStripeEvent: read failed", { cause: seen.error });
  if (seen.data) return { status: "duplicate" };

  const snapshot = await syncCustomer(customerId, { ...deps, admin });
  if (!snapshot)
    logError(
      new Error(`stripe webhook: ${event.type} for an unknown customer`),
      { op: "stripe.webhook" },
    );
  const record = await admin
    .from("stripe_events")
    .upsert(
      { id: event.id, type: event.type },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (record.error)
    throw new Error("handleStripeEvent: record failed", {
      cause: record.error,
    });

  // A-20: prune old event IDs; a failure here only gets logged.
  const cutoff = isoDaysBefore(deps.now ?? new Date(), EVENT_RETENTION_DAYS);
  const prune = await admin
    .from("stripe_events")
    .delete()
    .lt("received_at", cutoff);
  if (prune.error) logError(prune.error, { op: "stripe.webhook.prune" });
  return { status: "synced" };
}

/**
 * Before an account is deleted (FR-37, T-117): cancel every live subscription now. Reads Stripe,
 * not the row, so a retry after a half-done run still finishes. Any Stripe error → { ok: false }
 * and the caller deletes nothing. Returns the Customer ID for deleteCustomer, which runs only
 * once the account is gone (so a failed account deletion never leaves a user with a dead one).
 */
export async function cancelForDeletion(
  userId: string,
  {
    stripe,
    admin = getAdminClient(),
  }: { stripe: StripeApi | null; admin?: Admin },
): Promise<{ ok: boolean; customerId?: string }> {
  const row = await admin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (row.error)
    throw new Error("cancelForDeletion: read failed", { cause: row.error });
  if (!row.data) return { ok: true };
  if (!stripe) {
    logError(new Error("cancelForDeletion: no Stripe key for a customer"), {
      op: "cancelForDeletion",
    });
    return { ok: false };
  }
  const customerId = row.data.stripe_customer_id;
  try {
    const list = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 10,
    });
    for (const sub of list.data)
      if (!ENDED.has(sub.status)) await stripe.subscriptions.cancel(sub.id);
    return { ok: true, customerId };
  } catch (error) {
    logError(error, { op: "cancelForDeletion" });
    return { ok: false };
  }
}

/** After the account is deleted (D8): delete its Stripe Customer. Best effort, logged. */
export async function deleteCustomer(
  customerId: string,
  { stripe }: { stripe: StripeApi | null },
): Promise<void> {
  if (!stripe) return;
  await stripe.customers.del(customerId).catch((error: unknown) => {
    if ((error as { code?: string }).code !== "resource_missing")
      logError(error, { op: "deleteCustomer" });
  });
}
