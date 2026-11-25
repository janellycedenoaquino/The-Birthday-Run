import { beforeEach, describe, expect, it, vi } from "vitest";
import { event, fakeDb, fakeStripe, sub } from "./fake-billing";

// BUILD F-8 "Tests": the two billing actions and the webhook route (FR-37, FR-38, NFR-8). The
// flag, the guard, the entitlement, Stripe and Supabase are the faked boundaries.
vi.mock("@/server/errors", async (io) =>
  (await import("./mock-helpers")).quietErrors(io),
);
const flags = { payments: true, premium: false, limited: false };
let db: ReturnType<typeof fakeDb>;
let fake: ReturnType<typeof fakeStripe>;
const USER = "00000000-0000-4000-8000-000000000001";

vi.mock("@/server/billing/flag", () => ({
  paymentsEnabled: () => flags.payments,
}));
vi.mock("@/server/billing/stripe", () => ({ getStripe: () => fake.stripe }));
vi.mock("@/server/env", () => ({
  env: { STRIPE_PRICE_ID: "price_test1", STRIPE_WEBHOOK_SECRET: "whsec_test" },
}));
vi.mock("@/server/premium/entitlement", () => ({
  getEntitlement: async () => ({ premium: flags.premium }),
}));
vi.mock("@/server/auth/app-guards", () => ({
  requireOnboarded: async () => ({
    supabase: db.client,
    user: { id: USER, email: "a@example.com" },
  }),
}));
vi.mock("@/server/security/rate-limit", () => ({
  rateLimit: async () =>
    flags.limited ? { ok: false, error: "M-5" } : { ok: true },
}));
vi.mock("@/server/site-url", () => ({
  getSiteUrl: () => "https://site.example",
}));
vi.mock("@/server/supabase/admin", () => ({ getAdminClient: () => db.client }));
vi.mock("next/navigation", () => import("./next-navigation-mock"));

const { createCheckoutSession, createPortalSession } =
  await import("@/server/actions/billing");
const webhook = await import("@/app/api/stripe/webhook/route");

const form = (fields: Record<string, string> = {}) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
async function outcome(p: Promise<unknown>) {
  try {
    return await p;
  } catch (error) {
    const url = (error as { url?: string }).url;
    if (url) return { redirect: url };
    throw error;
  }
}

beforeEach(() => {
  flags.payments = true;
  flags.premium = false;
  flags.limited = false;
  db = fakeDb();
  fake = fakeStripe();
});

describe("payments off (FR-38)", () => {
  it.each([[false], [true]])(
    "both actions → BR-15 with no Stripe call (premium: %s)",
    async (premium) => {
      flags.payments = false;
      flags.premium = premium;
      expect(
        await createCheckoutSession(null, form({ from: "/plan" })),
      ).toEqual({
        ok: false,
        error: "BR-15",
      });
      expect(await createPortalSession(null, form())).toEqual({
        ok: false,
        error: "BR-15",
      });
      expect(fake.state.calls).toEqual([]);
    },
  );
});

describe("createCheckoutSession (FR-37)", () => {
  it("creates the Customer and a subscription session, then redirects to Stripe", async () => {
    expect(
      await outcome(createCheckoutSession(null, form({ from: "/plan" }))),
    ).toEqual({ redirect: "https://checkout.stripe.com/c/pay/cs_test_1" });
    expect(fake.state.sessionParams).toEqual({
      mode: "subscription",
      customer: "cus_new1",
      client_reference_id: USER,
      line_items: [{ price: "price_test1", quantity: 1 }],
      success_url: "https://site.example/billing/return",
      cancel_url: "https://site.example/plan",
    });
  });

  it.each([
    ["an off-site URL", "https://evil.example/x"],
    ["a protocol-relative URL", "//evil.example"],
  ])("%s as `from` → the cancel URL stays on the site", async (_, from) => {
    await outcome(createCheckoutSession(null, form({ from })));
    expect(String(fake.state.sessionParams!.cancel_url)).toMatch(
      /^https:\/\/site\.example\//,
    );
  });

  it("a premium user (grant or paid) → BR-16, no Stripe call", async () => {
    flags.premium = true;
    expect(await createCheckoutSession(null, form())).toEqual({
      ok: false,
      error: "BR-16",
    });
    expect(fake.state.calls).toEqual([]);
  });

  it("paid moments ago (webhook not synced yet): Stripe is asked, so BR-16, no second charge", async () => {
    db.data.subscriptions.push({
      user_id: USER,
      stripe_customer_id: "cus_1",
      status: null,
      synced_at: "2000-01-01T00:00:00.000Z",
    });
    for (const status of ["active", "incomplete", "unpaid"]) {
      fake.state.calls = [];
      fake.state.subscriptions = [sub("sub_1", status, 1)];
      expect(await createCheckoutSession(null, form()), status).toEqual({
        ok: false,
        error: "BR-16",
      });
      expect(fake.state.calls).not.toContain("checkout.sessions.create");
    }
  });

  it("an ended subscription allows a new checkout", async () => {
    db.data.subscriptions.push({
      user_id: USER,
      stripe_customer_id: "cus_1",
      status: "canceled",
      synced_at: "2000-01-01T00:00:00.000Z",
    });
    fake.state.subscriptions = [sub("sub_1", "canceled", 1)];
    expect(await outcome(createCheckoutSession(null, form()))).toMatchObject({
      redirect: expect.stringContaining("checkout.stripe.com"),
    });
  });

  it("a stored live subscription → BR-16, no session", async () => {
    db.data.subscriptions.push({
      user_id: USER,
      stripe_customer_id: "cus_1",
      status: "past_due",
    });
    expect(await createCheckoutSession(null, form())).toEqual({
      ok: false,
      error: "BR-16",
    });
    expect(fake.state.calls).not.toContain("checkout.sessions.create");
  });

  it("an extra field → API-4; rate limited → M-5", async () => {
    expect(
      await createCheckoutSession(null, form({ plan: "lifetime" })),
    ).toMatchObject({
      ok: false,
      error: "API-4",
    });
    flags.limited = true;
    expect(await createCheckoutSession(null, form())).toEqual({
      ok: false,
      error: "M-5",
    });
    expect(fake.state.calls).toEqual([]);
  });
});

describe("createPortalSession (FR-37)", () => {
  it("no subscriptions row → BR-2", async () => {
    expect(await createPortalSession(null, form())).toEqual({
      ok: false,
      error: "BR-2",
    });
  });

  it("opens the portal for the caller's own Customer", async () => {
    db.data.subscriptions.push({
      user_id: USER,
      stripe_customer_id: "cus_1",
      status: "active",
    });
    expect(await outcome(createPortalSession(null, form()))).toEqual({
      redirect: "https://billing.stripe.com/p/session/test_1",
    });
    expect(fake.state.portalParams).toEqual({
      customer: "cus_1",
      return_url: "https://site.example/settings#premium",
    });
  });
});

describe("POST /api/stripe/webhook (NFR-8, D8)", () => {
  const body = JSON.stringify(
    event("evt_1", "customer.subscription.created", { customer: "cus_1" }),
  );
  const post = (signature?: string) =>
    webhook.POST(
      new Request("https://site.example/api/stripe/webhook", {
        method: "POST",
        headers: signature ? { "stripe-signature": signature } : {},
        body,
      }),
    );
  beforeEach(() => {
    db.data.subscriptions.push({
      user_id: USER,
      stripe_customer_id: "cus_1",
      status: null,
      synced_at: "2000-01-01T00:00:00.000Z",
    });
  });

  it.each([
    ["no signature", undefined],
    ["a bad signature", "forged"],
  ])("%s → 400, nothing written", async (_, signature) => {
    const res = await post(signature);
    expect(res.status).toBe(400);
    expect(db.data.stripe_events).toEqual([]);
    expect(fake.state.calls).not.toContain("subscriptions.list");
  });

  it("a signed event syncs and answers 200 (works with payments off too)", async () => {
    flags.payments = false;
    fake.state.subscriptions = [sub("sub_1", "active", 1)];
    const res = await post("valid:whsec_test");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    expect(db.data.subscriptions[0]).toMatchObject({ status: "active" });
  });

  it("sync failing → 500 (Stripe retries), then the retry syncs", async () => {
    fake.state.subscriptions = [sub("sub_1", "active", 1)];
    fake.state.listFailures = 1;
    expect((await post("valid:whsec_test")).status).toBe(500);
    expect((await post("valid:whsec_test")).status).toBe(200);
    expect(db.data.subscriptions[0]).toMatchObject({ status: "active" });
  });
});
