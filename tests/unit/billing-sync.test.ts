import { beforeEach, describe, expect, it, vi } from "vitest";
import { event, fakeDb, fakeStripe, sub } from "./fake-billing";

// BUILD F-8 "Tests" for the billing module (NFR-8, D8, T-103, T-117), with a fake Stripe and an
// in-memory database: the payload's state is never trusted, an event is handled once, a failed
// sync releases its claim so Stripe's retry runs, and an unknown customer never gets a row.
vi.mock("server-only", () => ({}));
vi.mock("@/server/errors", async (io) =>
  (await import("./mock-helpers")).quietErrors(io),
);
const { handleStripeEvent, syncCustomer, ensureCustomer, cancelForDeletion } =
  await import("@/server/billing/sync");

const USER = "00000000-0000-4000-8000-000000000001";
let db: ReturnType<typeof fakeDb>;
let fake: ReturnType<typeof fakeStripe>;
const deps = () => ({
  stripe: fake.stripe as never,
  admin: db.client as never,
});
const subRow = () => db.data.subscriptions[0]!;

beforeEach(() => {
  db = fakeDb({
    subscriptions: [
      {
        user_id: USER,
        stripe_customer_id: "cus_1",
        stripe_subscription_id: null,
        status: null,
        current_period_end: null,
        cancel_at_period_end: false,
      },
    ],
  });
  fake = fakeStripe();
});

describe("handleStripeEvent (D8, NFR-8)", () => {
  const updated = (id = "evt_1", status = "active") =>
    event(id, "customer.subscription.updated", { customer: "cus_1", status });

  it("syncs from Stripe, not from the payload (stale event says active, Stripe says canceled)", async () => {
    fake.state.subscriptions = [sub("sub_1", "canceled", 100)];
    expect(await handleStripeEvent(updated(), deps())).toEqual({
      status: "synced",
    });
    expect(subRow()).toMatchObject({
      stripe_subscription_id: "sub_1",
      status: "canceled",
    });
  });

  it("the same event twice: one claim, and the second makes no Stripe call", async () => {
    fake.state.subscriptions = [sub("sub_1", "active", 100)];
    await handleStripeEvent(updated(), deps());
    const callsAfterFirst = fake.state.calls.length;
    expect(await handleStripeEvent(updated(), deps())).toEqual({
      status: "duplicate",
    });
    expect(fake.state.calls.length).toBe(callsAfterFirst);
    expect(db.data.stripe_events.map((e) => e.id)).toEqual(["evt_1"]);
  });

  it("a failed sync releases the claim and throws (500); the retry then syncs", async () => {
    fake.state.subscriptions = [sub("sub_1", "active", 100)];
    fake.state.listFailures = 1;
    await expect(handleStripeEvent(updated(), deps())).rejects.toThrow();
    expect(db.data.stripe_events).toEqual([]);
    expect(await handleStripeEvent(updated(), deps())).toEqual({
      status: "synced",
    });
    expect(subRow().status).toBe("active");
  });

  it("an event type we don't handle, or with no customer, changes nothing", async () => {
    expect(
      await handleStripeEvent(
        event("evt_x", "charge.refunded", { customer: "cus_1" }),
        deps(),
      ),
    ).toEqual({ status: "ignored" });
    expect(
      await handleStripeEvent(event("evt_y", "invoice.paid", {}), deps()),
    ).toEqual({ status: "ignored" });
    expect(db.data.stripe_events).toEqual([]);
    expect(fake.state.calls).toEqual([]);
  });

  it("prunes event IDs older than 30 days (A-20)", async () => {
    db.data.stripe_events.push({
      id: "evt_old",
      type: "invoice.paid",
      received_at: "2020-01-01T00:00:00.000Z",
    });
    fake.state.subscriptions = [sub("sub_1", "active", 100)];
    await handleStripeEvent(updated(), deps());
    expect(db.data.stripe_events.map((e) => e.id)).toEqual(["evt_1"]);
  });
});

describe("syncCustomer (D8, T-117)", () => {
  it("an unknown customer gets no row", async () => {
    expect(await syncCustomer("cus_unknown", deps())).toBeNull();
    expect(db.data.subscriptions).toHaveLength(1);
    expect(fake.state.calls).toEqual([]);
  });

  it("picks the current subscription by status, then newest", async () => {
    fake.state.subscriptions = [
      sub("sub_old_canceled", "canceled", 300),
      sub("sub_past_due", "past_due", 100),
      sub("sub_active", "active", 50, {
        cancel_at_period_end: true,
        period_end: 1_800_000_000,
      }),
    ];
    const s = await syncCustomer("cus_1", deps());
    expect(s).toMatchObject({
      stripe_subscription_id: "sub_active",
      status: "active",
      cancel_at_period_end: true,
      current_period_end: new Date(1_800_000_000 * 1000).toISOString(),
    });
  });

  it("no subscriptions → status null (Checkout abandoned: free)", async () => {
    const s = await syncCustomer("cus_1", deps());
    expect(s).toMatchObject({ stripe_subscription_id: null, status: null });
  });
});

describe("ensureCustomer (D8, T-102)", () => {
  const fresh = "00000000-0000-4000-8000-000000000002";

  it("reuses the stored Customer", async () => {
    const r = await ensureCustomer(
      { id: USER, email: "a@example.com" },
      { ...deps(), supabase: db.client as never },
    );
    expect(r).toEqual({ customerId: "cus_1", status: null });
    expect(fake.state.calls).toEqual([]);
  });

  it("first checkout: creates the Customer and the row", async () => {
    const r = await ensureCustomer(
      { id: fresh, email: "b@example.com" },
      { ...deps(), supabase: db.client as never },
    );
    expect(r.customerId).toBe("cus_new1");
    expect(
      db.data.subscriptions.find((s) => s.user_id === fresh),
    ).toMatchObject({
      stripe_customer_id: "cus_new1",
    });
  });

  it("two checkouts at once: one row, and the losing Customer is deleted", async () => {
    // The user's read sees no row; by the insert, the other request has stored its Customer.
    const own = fakeDb();
    db.data.subscriptions.push({
      user_id: fresh,
      stripe_customer_id: "cus_winner",
      status: null,
    });
    const r = await ensureCustomer(
      { id: fresh, email: "b@example.com" },
      { ...deps(), supabase: own.client as never },
    );
    expect(r.customerId).toBe("cus_winner");
    expect(
      db.data.subscriptions.filter((s) => s.user_id === fresh),
    ).toHaveLength(1);
    expect(fake.state.calls).toEqual([
      "customers.create",
      "customers.del cus_new1",
    ]);
  });
});

describe("cancelForDeletion (FR-37, T-117)", () => {
  it("no row: nothing to do", async () => {
    db.data.subscriptions.length = 0;
    expect(await cancelForDeletion(USER, deps())).toEqual({ ok: true });
    expect(fake.state.calls).toEqual([]);
  });

  it("cancels live subscriptions (not ended ones), then deletes the Customer", async () => {
    fake.state.subscriptions = [
      sub("sub_live", "past_due", 2),
      sub("sub_done", "canceled", 1),
    ];
    expect(await cancelForDeletion(USER, deps())).toEqual({ ok: true });
    expect(fake.state.calls).toEqual([
      "subscriptions.list",
      "subscriptions.cancel sub_live",
      "customers.del cus_1",
    ]);
  });

  it("a Stripe error, or no Stripe key with a row → { ok: false }", async () => {
    fake.state.listFailures = 1;
    expect(await cancelForDeletion(USER, deps())).toEqual({ ok: false });
    expect(
      await cancelForDeletion(USER, {
        stripe: null,
        admin: db.client as never,
      }),
    ).toEqual({ ok: false });
  });
});
