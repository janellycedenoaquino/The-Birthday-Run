import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STRIPE_API_VERSION } from "@/server/billing/stripe";
import { handleStripeEvent } from "@/server/billing/sync";
import {
  adminClient,
  createUser,
  deleteUsers,
  sql,
  type TestUser,
} from "./helpers";

// Metric 3 (BUILD F-8 "Metric 3 test", FR-37, NFR-8): real Stripe test mode, local database.
// A subscription's life (paid, renewal failing, ended, cancel at period end) turns premium on
// and off through signed webhook events alone, with no manual step. Runs only when
// STRIPE_TEST_SECRET_KEY is set (a sandbox key); CI says "metric 3: SKIPPED" otherwise, never a
// pass. Checkout's hosted page can't be completed headlessly, so the Customer is stored the way
// ensureCustomer does (the session itself is covered by tests/unit/billing-actions.test.ts).
const KEY = process.env.STRIPE_TEST_SECRET_KEY;
const WEBHOOK_SECRET = `whsec_${randomUUID().replaceAll("-", "")}`;
const DAY = 86_400;

describe.skipIf(!KEY)(
  "metric 3: Stripe test mode drives premium (FR-37)",
  () => {
    let stripe: Stripe;
    let user: TestUser;
    let db: ReturnType<typeof sql>;
    let clock: Stripe.TestHelpers.TestClock;
    let customer: string;
    let price: string;
    let replay: string;

    /** A signed event envelope, verified like the webhook route does, then handled. */
    async function deliver(type: string) {
      const payload = JSON.stringify({
        id: `evt_test_${randomUUID()}`,
        object: "event",
        type,
        data: { object: { customer } },
      });
      const header = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });
      const event = stripe.webhooks.constructEvent(
        payload,
        header,
        WEBHOOK_SECRET,
      );
      expect(
        await handleStripeEvent(event, { stripe, admin: adminClient() }),
      ).toEqual({
        status: "synced",
      });
      return payload;
    }
    const premium = async () => (await user.client.rpc("is_premium")).data;

    async function advance(to: number) {
      await stripe.testHelpers.testClocks.advance(clock.id, {
        frozen_time: to,
      });
      for (let i = 0; i < 60; i++) {
        clock = await stripe.testHelpers.testClocks.retrieve(clock.id);
        if (clock.status === "ready") return;
        await new Promise((r) => setTimeout(r, 2000));
      }
      throw new Error("test clock didn't finish advancing");
    }

    beforeAll(async () => {
      stripe = new Stripe(KEY!, { apiVersion: STRIPE_API_VERSION });
      db = sql();
      user = await createUser("metric3");
      clock = await stripe.testHelpers.testClocks.create({
        frozen_time: Math.floor(Date.now() / 1000),
      });
      const product = await stripe.products.create({ name: "Metric 3 test" });
      price = (
        await stripe.prices.create({
          product: product.id,
          currency: "usd",
          unit_amount: 300,
          recurring: { interval: "month" },
        })
      ).id;
      customer = (
        await stripe.customers.create({
          test_clock: clock.id,
          payment_method: "pm_card_visa",
          invoice_settings: { default_payment_method: "pm_card_visa" },
          metadata: { user_id: user.id },
        })
      ).id;
      await db`insert into public.subscriptions (user_id, stripe_customer_id)
             values (${user.id}, ${customer})`;
    }, 60_000);

    afterAll(async () => {
      if (clock)
        await stripe.testHelpers.testClocks.del(clock.id).catch(() => {});
      if (user) await deleteUsers(user);
      await db?.end();
    });

    it("a new subscription turns premium on", async () => {
      expect(await premium()).toBe(false);
      await stripe.subscriptions.create({ customer, items: [{ price }] });
      replay = await deliver("customer.subscription.created");
      expect(await premium()).toBe(true);
    }, 60_000);

    it("a failed renewal is past_due (still premium); Stripe giving up ends it", async () => {
      const failing = await stripe.paymentMethods.attach(
        "pm_card_chargeCustomerFail",
        {
          customer,
        },
      );
      await stripe.customers.update(customer, {
        invoice_settings: { default_payment_method: failing.id },
      });
      const [sub] = (await stripe.subscriptions.list({ customer })).data;
      await advance(sub!.items.data[0]!.current_period_end + 3600);
      await deliver("invoice.payment_failed");
      const [row] =
        await db`select status from public.subscriptions where user_id = ${user.id}`;
      expect(row!.status).toBe("past_due");
      expect(await premium()).toBe(true);
      // What Stripe does when the retries run out under "cancel the subscription".
      await stripe.subscriptions.cancel(sub!.id);
      await deliver("customer.subscription.deleted");
      expect(await premium()).toBe(false);
    }, 180_000);

    it("cancel at period end: premium until the period ends, then off", async () => {
      const visa = await stripe.paymentMethods.attach("pm_card_visa", {
        customer,
      });
      await stripe.customers.update(customer, {
        invoice_settings: { default_payment_method: visa.id },
      });
      const sub = await stripe.subscriptions.create({
        customer,
        items: [{ price }],
      });
      await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true });
      await deliver("customer.subscription.updated");
      expect(await premium()).toBe(true);
      await advance(sub.items.data[0]!.current_period_end + DAY);
      await deliver("customer.subscription.deleted");
      expect(await premium()).toBe(false);
    }, 180_000);

    it("replaying the first event under a new ID doesn't bring premium back", async () => {
      const old = JSON.parse(replay) as { id: string };
      const payload = JSON.stringify({
        ...old,
        id: `evt_test_${randomUUID()}`,
      });
      const header = stripe.webhooks.generateTestHeaderString({
        payload,
        secret: WEBHOOK_SECRET,
      });
      const event = stripe.webhooks.constructEvent(
        payload,
        header,
        WEBHOOK_SECRET,
      );
      await handleStripeEvent(event, { stripe, admin: adminClient() });
      expect(await premium()).toBe(false);
    }, 60_000);
  },
);
