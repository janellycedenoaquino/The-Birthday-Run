import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createUser,
  deleteUsers,
  publicClient,
  signIn,
  type Client,
  type TestUser,
} from "./helpers";
import { enrollTotp, totp } from "./totp";

// public.pickups RLS and create_pickup (BUILD F-5 "Tests": FR-17, FR-20, NFR-1, D7). Required for
// every USER_DATA_TABLES entry (the catalog test checks this file exists).
const RETAILER = "starbucks";
const OTHER = "sephora";
// Cycle bounds as the action passes them (decision 0008); the dates only need to be inside.
const CYCLE = { p_cycle_start: "2026-05-15", p_cycle_end: "2027-05-14" };
let a: TestUser;
let b: TestUser;

const pickup = (client: Client, over: Record<string, unknown> = {}) =>
  client.rpc("create_pickup", {
    p_retailer_id: RETAILER,
    p_picked_up_on: "2026-06-15",
    p_note: "Venti",
    p_location_label: "Main St",
    ...CYCLE,
    ...over,
  } as never);

const rowsOf = async (userId: string) =>
  (
    await adminClient()
      .from("pickups")
      .select("retailer_id, picked_up_on, note")
      .eq("user_id", userId)
  ).data ?? [];

beforeAll(async () => {
  a = await createUser("pickups-a");
  b = await createUser("pickups-b");
  for (const u of [a, b]) {
    const { error } = await u.client.from("enrollments").insert(
      [RETAILER, OTHER].map((retailer_id) => ({
        user_id: u.id,
        retailer_id,
      })),
    );
    if (error) throw new Error(`setup enroll failed: ${error.message}`);
  }
});
afterAll(() => deleteUsers(a, b)); // cascades enrollments and pickups

describe("create_pickup (FR-17, D7)", () => {
  it("A picks up once; a second in the same cycle → pickup_exists", async () => {
    const first = await pickup(a.client);
    expect(first.error).toBeNull();
    expect(typeof first.data).toBe("string");
    const second = await pickup(a.client, { p_picked_up_on: "2026-06-16" });
    expect(second.error?.message).toBe("pickup_exists");
    expect(await rowsOf(a.id)).toEqual([
      { retailer_id: RETAILER, picked_up_on: "2026-06-15", note: "Venti" },
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

  it("a date outside the cycle → pickup_out_of_cycle", async () => {
    const r = await pickup(a.client, {
      p_retailer_id: OTHER,
      p_picked_up_on: "2027-06-01",
    });
    expect(r.error?.message).toBe("pickup_out_of_cycle");
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
      .update({ picked_up_on: "2026-06-20" } as never)
      .eq("user_id", a.id);
    expect(date.error?.code).toBe("42501");
  });

  it("A can't insert directly: only create_pickup creates rows", async () => {
    const { error } = await a.client.from("pickups").insert({
      user_id: a.id,
      retailer_id: OTHER,
      picked_up_on: "2026-06-15",
    } as never);
    expect(error?.code).toBe("42501");
  });

  it("the note limit is enforced by the database too (FR-17: 500)", async () => {
    const { error } = await a.client
      .from("pickups")
      .update({ note: "x".repeat(501) })
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
    await m.client
      .from("enrollments")
      .insert({ user_id: m.id, retailer_id: RETAILER });
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
