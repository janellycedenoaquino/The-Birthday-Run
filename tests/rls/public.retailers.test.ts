import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createUser,
  deleteUsers,
  publicClient,
  sql,
  type TestUser,
} from "./helpers";

// public.retailers RLS and grants (BUILD F-1 "Tests": D3, FR-2). Rows are seeded as `postgres`
// (the import's role); every read goes through PostgREST like the app.
const db = sql();
const PREFIX = "rls-test-";
const ids = {
  popular: `${PREFIX}popular`,
  hidden: `${PREFIX}hidden`,
  retiredPopular: `${PREFIX}retired-popular`,
};
let user: TestUser;
let before: { popular: number; total: number };

const row = (id: string, isPopular: boolean, retired: boolean) => ({
  id,
  name: id,
  category: "food_drink",
  description: "Test retailer",
  reward_description: "A free test item",
  timing_type: "birth_month",
  reward_type: "free_item",
  requires_purchase: false,
  states_scope: "all",
  is_popular: isPopular,
  last_checked_on: "2026-11-01",
  source_url: "https://example.com/rewards",
  retired_at: retired ? new Date() : null,
});

beforeAll(async () => {
  const { data } = await publicClient().rpc("retailer_counts").single();
  before = data!;
  await db`insert into public.retailers ${db([
    row(ids.popular, true, false),
    row(ids.hidden, false, false),
    row(ids.retiredPopular, true, true),
  ])}`;
  user = await createUser("retailers");
});

afterAll(async () => {
  await db`delete from public.retailers where id like ${PREFIX + "%"}`;
  await deleteUsers(user);
  await db.end();
});

const seededIds = (rows: { id: string }[] | null) =>
  (rows ?? [])
    .map((r) => r.id)
    .filter((id) => id.startsWith(PREFIX))
    .sort();

describe("public.retailers (D3, FR-2)", () => {
  it("anon sees only popular, non-retired rows", async () => {
    const { data, error } = await publicClient().from("retailers").select("id");
    expect(error).toBeNull();
    expect(seededIds(data)).toEqual([ids.popular]);
  });

  it("anon gets 0 rows for a non-popular id", async () => {
    const { data } = await publicClient()
      .from("retailers")
      .select("id")
      .eq("id", ids.hidden);
    expect(data).toEqual([]);
  });

  it("authenticated sees every row, retired too", async () => {
    const { data, error } = await user.client.from("retailers").select("id");
    expect(error).toBeNull();
    expect(seededIds(data)).toEqual(
      [ids.hidden, ids.popular, ids.retiredPopular].sort(),
    );
  });

  it.each([
    ["anon", () => publicClient()],
    ["authenticated", () => user.client],
  ])("%s can't insert, update or delete", async (_, client) => {
    const c = client();
    const ins = await c.from("retailers").insert({
      ...row(`${PREFIX}new`, true, false),
      retired_at: null,
    } as never);
    expect(ins.error?.code).toBe("42501");
    await c.from("retailers").update({ name: "changed" }).eq("id", ids.popular);
    await c.from("retailers").delete().eq("id", ids.popular);
    const [r] =
      await db`select name from public.retailers where id = ${ids.popular}`;
    expect(r?.name).toBe(ids.popular);
  });

  it("retailer_counts() as anon counts non-retired rows, popular and total", async () => {
    const { data, error } = await publicClient()
      .rpc("retailer_counts")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({
      popular: before.popular + 1,
      total: before.total + 2,
    });
  });
});
