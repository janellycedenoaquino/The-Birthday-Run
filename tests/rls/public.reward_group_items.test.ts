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

  it("A can't put an item into B's group (the composite FK)", async () => {
    const r = await a.client.from("reward_group_items").insert({
      group_id: bGroup,
      user_id: a.id,
      retailer_id: IDS[0]!,
      position: 1,
    });
    expect(r.error).not.toBeNull();
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
  it("rewrites the order in one call; a stale list → stale_group_order", async () => {
    const items = await itemsOf(planA);
    const reversed = [...items].reverse().map((i) => i.id);
    expect(
      (
        await a.client.rpc("reorder_group_items", {
          p_group_id: planA,
          p_item_ids: reversed,
        })
      ).error,
    ).toBeNull();
    expect((await itemsOf(planA)).map((i) => i.id)).toEqual(reversed);
    const stale = await a.client.rpc("reorder_group_items", {
      p_group_id: planA,
      p_item_ids: reversed.slice(1),
    });
    expect(stale.error?.message).toBe("stale_group_order");
  });

  it("B can't reorder A's group: it's not found for B", async () => {
    const r = await b.client.rpc("reorder_group_items", {
      p_group_id: planA,
      p_item_ids: [],
    });
    expect(r.error?.message).toBe("group_not_found");
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
