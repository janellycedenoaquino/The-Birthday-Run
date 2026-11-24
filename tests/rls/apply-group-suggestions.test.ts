import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setPremium } from "../../scripts/grant-premium";
import {
  birthdayTodayWith,
  createUser,
  dayFromToday,
  deleteUsers,
  publicClient,
  sql,
  type TestUser,
} from "./helpers";

// apply_group_suggestions (BUILD F-11 "Tests": FR-29 atomic, FR-25, FR-26, T-101). Invoker: RLS,
// the column grants and F-6's triggers apply to every row, and one refusal undoes the whole call.
// Premium only, in the database too (migration 20261124180000).
let db: ReturnType<typeof sql>;
let ids: string[];
let premium: TestUser;
let free: TestUser;
const suggestion = (name: string, retailerIds: string[]) => ({
  name,
  pickupDate: dayFromToday(1),
  pickupTime: "10:00",
  retailerIds,
});
const groupCount = async (user: TestUser) =>
  (await user.client.from("reward_groups").select("id")).data?.length ?? -1;
const apply = (user: TestUser, groups: unknown) =>
  user.client.rpc("apply_group_suggestions", { p_groups: groups as never });

beforeAll(async () => {
  db = sql();
  // 11 listed programs: one more than FR-25's premium limit of 10.
  ids = (
    await db<{ id: string }[]>`
      select id from public.retailers where retired_at is null order by id limit 11`
  ).map((r) => r.id);
  premium = await createUser("suggest-premium");
  free = await createUser("suggest-free");
  await birthdayTodayWith(premium, ids);
  await birthdayTodayWith(free, ids.slice(0, 2));
  await setPremium(db, premium.email, "grant");
});
afterAll(async () => {
  await deleteUsers(premium, free);
  await db.end();
});

describe("apply_group_suggestions (FR-29)", () => {
  it("creates every group with its items in the given order", async () => {
    const { data, error } = await apply(premium, [
      suggestion("Run 1", [ids[1]!, ids[0]!]),
      suggestion("Run 2", [ids[2]!, ids[2]!]), // a repeat is added once
    ]);
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    const { data: items } = await premium.client
      .from("reward_group_items")
      .select("retailer_id")
      .eq("group_id", data![0]!)
      .order("position");
    expect(items?.map((i) => i.retailer_id)).toEqual([ids[1], ids[0]]);
  });

  it("a limit broken on the third group creates no groups at all", async () => {
    const before = await groupCount(premium);
    const { error } = await apply(premium, [
      suggestion("Run 5", [ids[0]!]),
      suggestion("Run 6", [ids[1]!]),
      suggestion("Run 7", ids), // 11 items: over FR-25's 10
    ]);
    expect(error?.message).toBe("plan_item_limit");
    expect(await groupCount(premium)).toBe(before);
  });

  it("a reward that isn't one of their programs undoes the groups before it", async () => {
    const before = await groupCount(free);
    await setPremium(db, free.email, "grant");
    const { error } = await apply(free, [
      suggestion("Run 8", [ids[0]!]),
      suggestion("Run 9", [ids[5]!]), // free isn't enrolled in this one
    ]);
    await setPremium(db, free.email, "revoke");
    expect(error).not.toBeNull();
    expect(await groupCount(free)).toBe(before);
  });

  it("a free user is refused in the database (T-101)", async () => {
    const { error } = await apply(free, [suggestion("Run 1", [ids[0]!])]);
    expect(error?.message).toBe("not_premium");
    expect(await groupCount(free)).toBe(0);
  });

  it("more than 4 groups or a non-array is refused", async () => {
    const five = Array.from({ length: 5 }, (_, i) =>
      suggestion(`X${i}`, [ids[0]!]),
    );
    expect((await apply(premium, five)).error?.message).toBe("invalid_input");
    expect((await apply(premium, {})).error?.message).toBe("invalid_input");
  });

  it("signed out: not allowed to call it", async () => {
    const { error } = await publicClient().rpc("apply_group_suggestions", {
      p_groups: [suggestion("Run 1", [ids[0]!])],
    });
    expect(error).not.toBeNull();
  });
});

describe("new groups dated before this birthday year (FR-24)", () => {
  it("are refused, so they can't slip past the free limit", async () => {
    const { error } = await free.client.from("reward_groups").insert({
      user_id: free.id,
      name: "Old run",
      pickup_date: dayFromToday(-400),
      pickup_time: "10:00",
    });
    expect(error?.message).toBe("pickup_out_of_cycle");
  });
});
