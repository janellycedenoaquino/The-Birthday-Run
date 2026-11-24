import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  birthdayTodayWith,
  createUser,
  dayFromToday,
  deleteUsers,
  publicClient,
  type TestUser,
} from "./helpers";

// apply_group_suggestions (BUILD F-11 "Tests": FR-29 atomic, FR-24, FR-26). Invoker: RLS, the
// column grants and F-6's triggers apply to every row, and one refusal undoes the whole call.
// The users are free, so FR-24's limit of 3 groups applies.
const IDS = ["16-handles", "altard-state"];
let a: TestUser;
let b: TestUser;
const suggestion = (name: string, retailerIds = IDS) => ({
  name,
  pickupDate: dayFromToday(1),
  pickupTime: "10:00",
  retailerIds,
});
const groupCount = async (user: TestUser) =>
  (await user.client.from("reward_groups").select("id")).data?.length ?? -1;

beforeAll(async () => {
  a = await createUser("suggest-a");
  b = await createUser("suggest-b");
  await birthdayTodayWith(a, IDS);
  await birthdayTodayWith(b, IDS);
});
afterAll(() => deleteUsers(a, b));

describe("apply_group_suggestions (FR-29)", () => {
  it("creates every group with its items in the given order", async () => {
    const { data, error } = await a.client.rpc("apply_group_suggestions", {
      p_groups: [
        suggestion("Run 1", [IDS[1]!, IDS[0]!]),
        suggestion("Run 2", [IDS[0]!]),
      ],
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
    const { data: items } = await a.client
      .from("reward_group_items")
      .select("retailer_id, position")
      .eq("group_id", data![0]!)
      .order("position");
    expect(items?.map((i) => i.retailer_id)).toEqual([IDS[1], IDS[0]]);
  });

  it("a limit broken on the third group creates no groups at all", async () => {
    // b has 1 group; 3 more would make 4 (free limit 3): the third insert is refused.
    await b.client.rpc("apply_group_suggestions", {
      p_groups: [suggestion("Mine")],
    });
    expect(await groupCount(b)).toBe(1);
    const { error } = await b.client.rpc("apply_group_suggestions", {
      p_groups: [suggestion("Run 1"), suggestion("Run 2"), suggestion("Run 3")],
    });
    expect(error?.message).toBe("plan_group_limit");
    expect(await groupCount(b)).toBe(1);
  });

  it("a bad item (not one of their programs) undoes the groups before it", async () => {
    const before = await groupCount(a);
    const { error } = await a.client.rpc("apply_group_suggestions", {
      p_groups: [suggestion("Run 8"), suggestion("Run 9", ["starbucks"])],
    });
    expect(error).not.toBeNull(); // the item trigger or the enrollment FK refuses it
    expect(await groupCount(a)).toBe(before);
  });

  it("more than 4 groups or a non-array is refused", async () => {
    const five = Array.from({ length: 5 }, (_, i) => suggestion(`X${i}`));
    expect(
      (await a.client.rpc("apply_group_suggestions", { p_groups: five })).error
        ?.message,
    ).toBe("invalid_input");
    expect(
      (await a.client.rpc("apply_group_suggestions", { p_groups: {} })).error
        ?.message,
    ).toBe("invalid_input");
  });

  it("signed out: not allowed to call it", async () => {
    const { error } = await publicClient().rpc("apply_group_suggestions", {
      p_groups: [suggestion("Run 1")],
    });
    expect(error).not.toBeNull();
  });
});
