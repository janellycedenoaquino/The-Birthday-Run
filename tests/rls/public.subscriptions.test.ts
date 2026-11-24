import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createUser,
  deleteUsers,
  publicClient,
  sql,
  type TestUser,
} from "./helpers";

// public.subscriptions RLS (BUILD F-7 "Tests": NFR-2, D5). Required for every USER_DATA_TABLES
// entry. Users read their own row and never write it; Stripe's webhook (F-8, service_role) does.
// is_premium's subscription states are in public.premium_grants.test.ts.
let a: TestUser;
let b: TestUser;

beforeAll(async () => {
  a = await createUser("subs-a");
  b = await createUser("subs-b");
  const db = sql();
  await db`insert into public.subscriptions (user_id, stripe_customer_id, status)
           values (${a.id}, ${"cus_" + a.id}, 'canceled')`;
  await db.end();
});
afterAll(async () => {
  await deleteUsers(a, b);
});

describe("public.subscriptions RLS (NFR-2)", () => {
  it("A reads their own row; B can't", async () => {
    expect(
      (await a.client.from("subscriptions").select("user_id")).data,
    ).toEqual([{ user_id: a.id }]);
    expect(
      (await b.client.from("subscriptions").select("user_id")).data,
    ).toEqual([]);
  });

  it("A can't insert, update or delete (no premium by hand)", async () => {
    const up = await a.client
      .from("subscriptions")
      .update({ status: "active" })
      .eq("user_id", a.id)
      .select();
    expect(up.error?.code).toBe("42501");
    const ins = await b.client.from("subscriptions").insert({
      user_id: b.id,
      stripe_customer_id: "cus_fake",
      status: "active",
    });
    expect(ins.error?.code).toBe("42501");
    const del = await a.client
      .from("subscriptions")
      .delete()
      .eq("user_id", a.id)
      .select();
    expect(del.error?.code).toBe("42501");
  });

  it("signed out reads nothing", async () => {
    expect(
      (await publicClient().from("subscriptions").select("user_id")).data ?? [],
    ).toEqual([]);
  });

  it("service_role can write it (the F-8 webhook)", async () => {
    const r = await adminClient()
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("user_id", a.id)
      .select("user_id");
    expect(r.error).toBeNull();
    expect(r.data).toEqual([{ user_id: a.id }]);
  });
});
