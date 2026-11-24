import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  birthdayTodayWith,
  createUser,
  dayFromToday,
  deleteUsers,
  publicClient,
  type Client,
  type TestUser,
} from "./helpers";

// public.reward_groups RLS and the group limit (BUILD F-6 "Tests": FR-23, FR-24, D6, NFR-1).
// Required for every USER_DATA_TABLES entry. Nobody is premium yet (is_premium() is false until
// F-7), so the free limit of 3 applies.
let a: TestUser;
let b: TestUser;
const group = (client: Client, user: TestUser, name: string) =>
  client
    .from("reward_groups")
    .insert({
      user_id: user.id,
      name,
      pickup_date: dayFromToday(1),
      pickup_time: "12:00",
    })
    .select("id")
    .single();

beforeAll(async () => {
  a = await createUser("groups-a");
  b = await createUser("groups-b");
  await birthdayTodayWith(a, []);
});
afterAll(() => deleteUsers(a, b));

describe("public.reward_groups (FR-23, FR-24, D6)", () => {
  it("names are unique per user ignoring case (BR-6)", async () => {
    expect((await group(a.client, a, "Plan A")).error).toBeNull();
    expect((await group(a.client, a, "plan a")).error?.code).toBe("23505");
    // Another user can use the same name.
    expect((await group(b.client, b, "Plan A")).error).toBeNull();
  });

  it.each([
    ["blank", ""],
    ["a control character", "Plan\u0007"],
    ["over 80 characters", "x".repeat(81)],
    ["outer spaces", " Plan "],
    ["a zero-width space", "Plan\u200b"],
    ["a line separator", "Plan\u2028A"],
  ])("refuses a name that's %s", async (_, name) => {
    expect((await group(a.client, a, name)).error?.code).toBe("23514");
  });

  it("the 4th group is refused, even through a direct insert (FR-24: free 3)", async () => {
    expect((await group(a.client, a, "Plan B")).error).toBeNull();
    expect((await group(a.client, a, "Plan C")).error).toBeNull();
    const fourth = await group(a.client, a, "Plan D");
    expect(fourth.error?.message).toBe("plan_group_limit");
    expect(fourth.error?.details).toBe("3");
  });

  it("past birthday years' groups don't count toward the 3 (owner, 2026-11-23)", async () => {
    const c = await createUser("groups-old");
    try {
      await birthdayTodayWith(c, []);
      // Three groups from a past year. Users can't date a new group back there any more
      // (pickup_out_of_cycle), so they're written as last year's would have been: by the service role.
      for (const name of ["Old 1", "Old 2", "Old 3"]) {
        const { error } = await adminClient()
          .from("reward_groups")
          .insert({
            user_id: c.id,
            name,
            pickup_date: dayFromToday(-400),
            pickup_time: "12:00",
          });
        expect(error).toBeNull();
      }
      for (const name of ["New 1", "New 2", "New 3"])
        expect((await group(c.client, c, name)).error).toBeNull();
      expect((await group(c.client, c, "New 4")).error?.message).toBe(
        "plan_group_limit",
      );
    } finally {
      await deleteUsers(c);
    }
  });

  it("two parallel inserts at the limit → exactly one succeeds (the profile lock)", async () => {
    // B has 1 group: two at once from 2 → 3 groups, never 4.
    await group(b.client, b, "B two");
    const results = await Promise.all([
      group(b.client, b, "B three"),
      group(b.client, b, "B four"),
    ]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    const { data } = await b.client.from("reward_groups").select("id");
    expect(data).toHaveLength(3);
  });

  it("over the limit, edits and deletes still work (FR-40: limits check inserts only)", async () => {
    const { data } = await a.client
      .from("reward_groups")
      .select("id, name")
      .eq("name", "Plan C")
      .single();
    const edit = await a.client
      .from("reward_groups")
      .update({ name: "Plan C2" })
      .eq("id", data!.id);
    expect(edit.error).toBeNull();
  });

  it("B can't read, update or delete A's groups; A can't create one for B", async () => {
    const { data } = await b.client
      .from("reward_groups")
      .select("id")
      .eq("user_id", a.id);
    expect(data).toEqual([]);
    await b.client
      .from("reward_groups")
      .update({ name: "hacked" })
      .eq("user_id", a.id);
    await b.client.from("reward_groups").delete().eq("user_id", a.id);
    const { data: mine } = await a.client.from("reward_groups").select("name");
    expect(mine?.map((g) => g.name).sort()).toEqual([
      "Plan A",
      "Plan B",
      "Plan C2",
    ]);
    expect((await group(a.client, b, "For B")).error?.code).toBe("42501");
  });

  it("anon reads none and can't insert", async () => {
    const anon = publicClient();
    expect((await anon.from("reward_groups").select("id")).data ?? []).toEqual(
      [],
    );
    expect((await group(anon, a, "Anon")).error).not.toBeNull();
  });
});
