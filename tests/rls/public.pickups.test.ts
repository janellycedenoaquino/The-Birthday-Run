import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  birthdayTodayWith,
  createUser,
  dayFromToday,
  deleteUsers,
  publicClient,
  signIn,
  type Client,
  type TestUser,
} from "./helpers";
import { enrollTotp, totp } from "./totp";

// public.pickups RLS and create_pickup (BUILD F-5 "Tests": FR-17, FR-20, NFR-1, D7). Required for
// every USER_DATA_TABLES entry (the catalog test checks this file exists). The function takes no
// cycle dates from the caller (decision 0008): it reads the caller's own birthday and zone. Test
// users get a birthday of today in UTC, so the dates below are always inside today's cycle.
const RETAILER = "starbucks";
const OTHER = "sephora";
const day = dayFromToday;
let a: TestUser;
let b: TestUser;

const pickup = (client: Client, over: Record<string, unknown> = {}) =>
  client.rpc("create_pickup", {
    p_retailer_id: RETAILER,
    p_picked_up_on: day(0),
    p_note: "Venti",
    p_location_label: "Main St",
    ...over,
  } as never);

const rowsOf = async (userId: string) =>
  (
    await adminClient()
      .from("pickups")
      .select("retailer_id, picked_up_on, note, location_label")
      .eq("user_id", userId)
  ).data ?? [];

beforeAll(async () => {
  a = await createUser("pickups-a");
  b = await createUser("pickups-b");
  await birthdayTodayWith(a, [RETAILER, OTHER]);
  await birthdayTodayWith(b, [RETAILER, OTHER]);
});
afterAll(() => deleteUsers(a, b)); // cascades enrollments and pickups

describe("create_pickup (FR-17, D7, decision 0008)", () => {
  it("A picks up once; a second in the same cycle, any date → pickup_exists", async () => {
    const first = await pickup(a.client);
    expect(first.error).toBeNull();
    expect(typeof first.data).toBe("string");
    const second = await pickup(a.client, { p_picked_up_on: day(-1) });
    expect(second.error?.message).toBe("pickup_exists");
    expect(await rowsOf(a.id)).toEqual([
      {
        retailer_id: RETAILER,
        picked_up_on: day(0),
        note: "Venti",
        location_label: "Main St",
      },
    ]);
  });

  it("two parallel calls → exactly one row (the profile lock)", async () => {
    const results = await Promise.all([
      pickup(b.client, { p_retailer_id: OTHER }),
      pickup(b.client, { p_retailer_id: OTHER }),
    ]);
    expect(results.filter((r) => r.error === null)).toHaveLength(1);
    expect(results.find((r) => r.error)?.error?.message).toBe("pickup_exists");
    expect(
      (await rowsOf(b.id)).filter((r) => r.retailer_id === OTHER),
    ).toHaveLength(1);
  });

  it.each([
    ["tomorrow (the future)", 1],
    ["years ahead", 1500],
    ["before today's cycle began (31 days before the birthday)", -40],
  ])("a date %s → pickup_out_of_cycle", async (_, offset) => {
    const r = await pickup(a.client, {
      p_retailer_id: OTHER,
      p_picked_up_on: day(offset),
    });
    expect(r.error?.message).toBe("pickup_out_of_cycle");
  });

  it("blank note and place are stored as nothing", async () => {
    const r = await pickup(b.client, { p_note: "", p_location_label: "   " });
    expect(r.error).toBeNull();
    const row = (await rowsOf(b.id)).find((x) => x.retailer_id === RETAILER);
    expect(row).toMatchObject({ note: null, location_label: null });
  });

  it("not enrolled → not_enrolled", async () => {
    const r = await pickup(a.client, { p_retailer_id: "chipotle" });
    expect(r.error?.message).toBe("not_enrolled");
  });

  it("anon can't execute it", async () => {
    const r = await pickup(publicClient());
    expect(r.error).not.toBeNull();
    expect(r.data).toBeNull();
  });
});

describe("public.pickups: own rows only (FR-20, NFR-1)", () => {
  it("B can't read, update or delete A's pickup", async () => {
    const { data } = await b.client
      .from("pickups")
      .select("id")
      .eq("user_id", a.id);
    expect(data).toEqual([]);
    await b.client
      .from("pickups")
      .update({ note: "hacked" })
      .eq("user_id", a.id);
    await b.client.from("pickups").delete().eq("user_id", a.id);
    expect((await rowsOf(a.id))[0]?.note).toBe("Venti");
  });

  it("anon reads none", async () => {
    const { data } = await publicClient().from("pickups").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("A can edit note and label, but not the date", async () => {
    const ok = await a.client
      .from("pickups")
      .update({ note: "Grande", location_label: "Airport" })
      .eq("user_id", a.id)
      .select("note, location_label");
    expect(ok.data).toEqual([{ note: "Grande", location_label: "Airport" }]);
    const date = await a.client
      .from("pickups")
      .update({ picked_up_on: day(-1) } as never)
      .eq("user_id", a.id);
    expect(date.error?.code).toBe("42501");
  });

  it("A can't insert directly: only create_pickup creates rows", async () => {
    const { error } = await a.client.from("pickups").insert({
      user_id: a.id,
      retailer_id: OTHER,
      picked_up_on: day(0),
    } as never);
    expect(error?.code).toBe("42501");
  });

  it.each([
    ["a 501-character note (FR-17: 500)", { note: "x".repeat(501) }],
    ["a blank place written directly", { location_label: "  " }],
  ])("the database refuses %s", async (_, values) => {
    const { error } = await a.client
      .from("pickups")
      .update(values)
      .eq("user_id", a.id);
    expect(error?.code).toBe("23514");
  });

  it("A can delete their own pickup", async () => {
    const { error } = await a.client
      .from("pickups")
      .delete()
      .eq("user_id", a.id);
    expect(error).toBeNull();
    expect(await rowsOf(a.id)).toEqual([]);
  });
});

describe("create_pickup and MFA (D8)", () => {
  let m: TestUser;
  afterAll(() => deleteUsers(m));

  it("an MFA user's aal1 session → not_allowed; after the code it works", async () => {
    m = await createUser("pickups-mfa");
    await birthdayTodayWith(m, [RETAILER, OTHER]);
    const factor = await enrollTotp(m.client);

    const pending = await signIn(m.email); // aal1 with a verified factor
    expect((await pickup(pending)).error?.message).toBe("not_allowed");

    const { error: stepUp } = await pending.auth.mfa.challengeAndVerify({
      factorId: factor.factorId,
      code: totp(factor.secret, Date.now() + 30_000),
    });
    expect(stepUp).toBeNull();
    expect((await pickup(pending)).error).toBeNull();
  });
});
