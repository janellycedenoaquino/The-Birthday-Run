import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  birthdayTodayWith,
  createUser,
  dayFromToday,
  deleteUsers,
  publicClient,
  type TestUser,
} from "./helpers";

// public.reward_group_items RLS, the item limit, reorder and removal (BUILD F-6 "Tests": FR-25,
// FR-26, FR-27, D6, NFR-1). Required for every USER_DATA_TABLES entry. Free limit: 5 per group.
const IDS = [
  "starbucks",
  "sephora",
  "chipotle",
  "panera-bread",
  "cvs",
  "ulta-beauty",
  "olive-garden",
];
let a: TestUser;
let b: TestUser;
let planA: string;
let planB: string;
let bGroup: string;

const newGroup = async (u: TestUser, name: string) => {
  const { data, error } = await u.client
    .from("reward_groups")
    .insert({
      user_id: u.id,
      name,
      pickup_date: dayFromToday(1),
      pickup_time: "12:00",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
};
const add = (u: TestUser, groupId: string, retailerIds: string[], from = 1) =>
  u.client.from("reward_group_items").insert(
    retailerIds.map((retailer_id, i) => ({
      group_id: groupId,
      user_id: u.id,
      retailer_id,
      position: from + i,
    })),
  );
const itemsOf = async (groupId: string) =>
  (
    await adminClient()
      .from("reward_group_items")
      .select("id, retailer_id, position")
      .eq("group_id", groupId)
      .order("position")
  ).data ?? [];

beforeAll(async () => {
  a = await createUser("items-a");
  b = await createUser("items-b");
  await birthdayTodayWith(a, IDS);
  await birthdayTodayWith(b, IDS.slice(0, 1));
  planA = await newGroup(a, "Plan A");
  planB = await newGroup(a, "Plan B");
  bGroup = await newGroup(b, "B's plan");
});
afterAll(() => deleteUsers(a, b));

describe("items and the limit (FR-25, FR-26, D6)", () => {
  it("an add over the free limit of 5 is refused whole: 6 at once → 0 rows", async () => {
    const r = await add(a, planA, IDS.slice(0, 6));
    expect(r.error?.message).toBe("plan_item_limit");
    expect(r.error?.details).toBe("5");
    expect(await itemsOf(planA)).toEqual([]);
  });

  it("5 fit; one more is refused", async () => {
    expect((await add(a, planA, IDS.slice(0, 5))).error).toBeNull();
    expect((await add(a, planA, [IDS[5]!], 6)).error?.message).toBe(
      "plan_item_limit",
    );
  });

  it("the same reward twice in one group → 23505 (BR-7); in another group → fine", async () => {
    expect((await add(a, planB, [IDS[0]!])).error).toBeNull();
    expect((await add(a, planB, [IDS[0]!], 2)).error?.code).toBe("23505");
  });

  it("only enrolled rewards: not enrolled → 23503 (BR-22)", async () => {
    expect((await add(a, planB, ["sugarfish"], 3)).error?.code).toBe("23503");
  });

  it("A can't put an item into B's group, and learns nothing about it (no leak)", async () => {
    const r = await a.client.from("reward_group_items").insert({
      group_id: bGroup,
      user_id: a.id,
      retailer_id: IDS[0]!,
      position: 1,
    });
    // The same answer as for a group that doesn't exist, whatever B's group holds.
    expect(r.error?.message).toBe("group_not_found");
    expect(await itemsOf(bGroup)).toEqual([]);
  });

  it("B can't read, move or delete A's items; anon reads none", async () => {
    const { data } = await b.client
      .from("reward_group_items")
      .select("id")
      .eq("user_id", a.id);
    expect(data).toEqual([]);
    await b.client
      .from("reward_group_items")
      .update({ position: 99 })
      .eq("user_id", a.id);
    await b.client.from("reward_group_items").delete().eq("user_id", a.id);
    expect(await itemsOf(planA)).toHaveLength(5);
    expect(
      (await publicClient().from("reward_group_items").select("id")).data ?? [],
    ).toEqual([]);
  });
});

describe("reorder_group_items (FR-27)", () => {
  it("rewrites the order when the caller saw the saved one", async () => {
    const items = (await itemsOf(planA)).map((i) => i.id);
    const reversed = [...items].reverse();
    const r = await a.client.rpc("reorder_group_items", {
      p_group_id: planA,
      p_expected: items,
      p_item_ids: reversed,
    });
    expect(r.error).toBeNull();
    expect((await itemsOf(planA)).map((i) => i.id)).toEqual(reversed);
  });

  it("another tab's older view is refused, even with the same items (BR-17)", async () => {
    // Tab B saved the reversed order above; tab A still shows the one before it.
    const now = (await itemsOf(planA)).map((i) => i.id);
    const tabA = [...now].reverse();
    const r = await a.client.rpc("reorder_group_items", {
      p_group_id: planA,
      p_expected: tabA,
      p_item_ids: tabA,
    });
    expect(r.error?.message).toBe("stale_group_order");
    expect((await itemsOf(planA)).map((i) => i.id)).toEqual(now);
  });

  it("a list with an item missing is refused too", async () => {
    const now = (await itemsOf(planA)).map((i) => i.id);
    const r = await a.client.rpc("reorder_group_items", {
      p_group_id: planA,
      p_expected: now,
      p_item_ids: now.slice(1),
    });
    expect(r.error?.message).toBe("stale_group_order");
  });

  it("B can't reorder A's group: it's not found for B", async () => {
    const r = await b.client.rpc("reorder_group_items", {
      p_group_id: planA,
      p_expected: [],
      p_item_ids: [],
    });
    expect(r.error?.message).toBe("group_not_found");
  });
});

describe("the database checks direct writes too (FR-26)", () => {
  it("positions come from the database, so two adds at once never share one", async () => {
    const g = await newGroup(a, "Positions");
    await Promise.all([add(a, g, [IDS[2]!], 1), add(a, g, [IDS[3]!], 1)]);
    const positions = (await itemsOf(g)).map((i) => i.position).sort();
    expect(positions).toEqual([1, 2]);
  });

  it("a retired retailer can't be added, even while still enrolled", async () => {
    const db = (await import("./helpers")).sql();
    try {
      await db`update public.retailers set retired_at = now() where id = ${IDS[6]!}`;
      const r = await add(a, planB, [IDS[6]!], 9);
      expect(r.error?.message).toBe("retailer_retired");
    } finally {
      await db`update public.retailers set retired_at = null where id = ${IDS[6]!}`;
      await db.end();
    }
  });
});

describe("leaving groups (FR-8, FR-26)", () => {
  it("a pickup removes the reward from every group", async () => {
    expect((await itemsOf(planB)).map((i) => i.retailer_id)).toEqual([IDS[0]]);
    const r = await a.client.rpc("create_pickup", {
      p_retailer_id: IDS[0]!,
      p_picked_up_on: dayFromToday(0),
      p_note: null,
      p_location_label: null,
    } as never);
    expect(r.error).toBeNull();
    expect(await itemsOf(planB)).toEqual([]);
    expect((await itemsOf(planA)).map((i) => i.retailer_id)).not.toContain(
      IDS[0],
    );
  });

  it("unenrolling removes the reward from its groups (cascade)", async () => {
    await a.client
      .from("enrollments")
      .delete()
      .eq("user_id", a.id)
      .eq("retailer_id", IDS[1]!);
    expect((await itemsOf(planA)).map((i) => i.retailer_id)).not.toContain(
      IDS[1],
    );
  });

  it("deleting a group deletes its items", async () => {
    await a.client.from("reward_groups").delete().eq("id", planA);
    expect(await itemsOf(planA)).toEqual([]);
  });
});
