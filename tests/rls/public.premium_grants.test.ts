import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GrantError, setPremium } from "../../scripts/grant-premium";
import {
  adminClient,
  createUser,
  deleteUsers,
  publicClient,
  sql,
  type TestUser,
} from "./helpers";

// public.premium_grants RLS (subscriptions: its own file), the grant script and is_premium (BUILD F-7
// "Tests": FR-35, FR-36, D5, NFR-2). Required for every USER_DATA_TABLES entry.
let a: TestUser;
let b: TestUser;
let db: ReturnType<typeof sql>;
const premium = async (u: TestUser) => (await u.client.rpc("is_premium")).data;

beforeAll(async () => {
  a = await createUser("premium-a");
  b = await createUser("premium-b");
  db = sql();
});
afterAll(async () => {
  await db.end();
  await deleteUsers(a, b);
});

describe("grant-premium (FR-36)", () => {
  it("a new account is free", async () => {
    expect(await premium(a)).toBe(false);
  });

  it("grant → premium on the next request; twice is harmless", async () => {
    expect((await setPremium(db, a.email.toUpperCase(), "grant")).outcome).toBe(
      "granted",
    );
    expect(await premium(a)).toBe(true);
    expect((await setPremium(db, a.email, "grant")).outcome).toBe(
      "already granted",
    );
    expect(await premium(b)).toBe(false);
  });

  it("revoke → free; twice is harmless; grant again turns it back on", async () => {
    expect((await setPremium(db, a.email, "revoke")).outcome).toBe("revoked");
    expect(await premium(a)).toBe(false);
    expect((await setPremium(db, a.email, "revoke")).outcome).toBe(
      "no active grant",
    );
    expect((await setPremium(db, a.email, "grant")).outcome).toBe("granted");
    expect(await premium(a)).toBe(true);
    await setPremium(db, a.email, "revoke");
  });

  it("unknown or invalid email: an error and nothing written", async () => {
    const before =
      await db`select count(*)::int as n from public.premium_grants`;
    await expect(
      setPremium(db, "nobody@example.test", "grant"),
    ).rejects.toMatchObject({
      message: "unknown email",
      exitCode: 1,
    });
    await expect(
      setPremium(db, "not-an-email", "grant"),
    ).rejects.toBeInstanceOf(GrantError);
    const after =
      await db`select count(*)::int as n from public.premium_grants`;
    expect(after[0]!.n).toBe(before[0]!.n);
  });
});

describe("is_premium: grants and subscriptions (FR-35, D5)", () => {
  const sub = async (status: string | null, periodEnd: string | null) => {
    await db`
      insert into public.subscriptions (user_id, stripe_customer_id, status, current_period_end)
      values (${b.id}, ${"cus_" + b.id}, ${status}, ${periodEnd})
      on conflict (user_id) do update
        set status = excluded.status, current_period_end = excluded.current_period_end`;
  };
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const past = new Date(Date.now() - 86_400_000).toISOString();

  it.each([
    ["active, period ahead", "active", future, true],
    ["past_due (Stripe retrying)", "past_due", future, true],
    ["active past its period end", "active", past, false],
    ["active with no period end (fails closed)", "active", null, false],
    ["trialing", "trialing", future, false],
    ["unpaid", "unpaid", future, false],
    ["incomplete", "incomplete", future, false],
    ["canceled", "canceled", future, false],
  ])("%s → %s", async (_label, status, end, want) => {
    await sub(status, end);
    expect(await premium(b)).toBe(want);
  });

  it("a grant keeps premium after the subscription is canceled", async () => {
    await sub("canceled", past);
    await setPremium(db, b.email, "grant");
    expect(await premium(b)).toBe(true);
  });

  it("revoking keeps premium while a subscription is active, and never touches it", async () => {
    await sub("active", future);
    expect((await setPremium(db, b.email, "revoke")).outcome).toBe("revoked");
    expect(await premium(b)).toBe(true);
    const s =
      await db`select status from public.subscriptions where user_id = ${b.id}`;
    expect(s[0]!.status).toBe("active");
    await sub("canceled", past);
    expect(await premium(b)).toBe(false);
  });
});

describe("RLS: read your own, write nothing (NFR-2)", () => {
  beforeAll(async () => {
    await setPremium(db, a.email, "grant");
  });

  it("A reads their own grant; B can't read A's", async () => {
    const own = await a.client.from("premium_grants").select("user_id");
    expect(own.data).toEqual([{ user_id: a.id }]);
    const other = await b.client
      .from("premium_grants")
      .select("user_id")
      .eq("user_id", a.id);
    expect(other.data).toEqual([]);
  });

  it("no one can grant themselves premium", async () => {
    const ins = await b.client.from("premium_grants").insert({ user_id: b.id });
    expect(ins.error?.code).toBe("42501");
    const up = await a.client
      .from("premium_grants")
      .update({ revoked_at: null })
      .eq("user_id", a.id)
      .select();
    expect(up.error?.code).toBe("42501");
    const del = await a.client
      .from("premium_grants")
      .delete()
      .eq("user_id", a.id)
      .select();
    expect(del.error?.code).toBe("42501");
  });

  it("signed out: nothing, and is_premium can't be called", async () => {
    const anon = publicClient();
    expect(
      (await anon.from("premium_grants").select("user_id")).data ?? [],
    ).toEqual([]);
    expect(
      (await anon.from("subscriptions").select("user_id")).data ?? [],
    ).toEqual([]);
    expect((await anon.rpc("is_premium")).error).not.toBeNull();
  });

  it("service_role can't write grants (only the owner's script can)", async () => {
    const r = await adminClient()
      .from("premium_grants")
      .insert({ user_id: b.id });
    expect(r.error?.code).toBe("42501");
  });

  it("private.is_premium isn't callable by app roles", async () => {
    const rows = await db`
      select has_function_privilege('authenticated', 'private.is_premium(uuid)', 'execute') as auth,
             has_function_privilege('anon', 'private.is_premium(uuid)', 'execute') as anon`;
    expect(rows[0]).toEqual({ auth: false, anon: false });
  });
});

describe("premium lifts the plan limits (FR-24, FR-25)", () => {
  it("a premium user can make a 4th group this year", async () => {
    const day = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    // A has no birthday set: current_cycle is null, so every group counts.
    for (const name of ["P1", "P2", "P3", "P4"]) {
      const r = await a.client.from("reward_groups").insert({
        user_id: a.id,
        name,
        pickup_date: day,
        pickup_time: "12:00",
      });
      expect(r.error).toBeNull();
    }
  });
});
