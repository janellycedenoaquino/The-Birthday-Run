import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createUser,
  deleteUsers,
  publicClient,
  sql,
  type TestUser,
} from "./helpers";

// public.enrollments RLS through PostgREST (BUILD F-3 "Tests": NFR-1, D3, FR-8). Required for every
// USER_DATA_TABLES entry (the catalog test checks this file exists).
const db = sql();
const LISTED = "rls-enroll-listed";
const OTHER = "rls-enroll-other";
const RETIRED = "rls-enroll-retired";
let a: TestUser;
let b: TestUser;

const retailer = (id: string, retired: boolean) => ({
  id,
  name: id,
  category: "food_drink",
  description: "Test retailer",
  reward_description: "A free test item",
  timing_type: "birth_month",
  reward_type: "free_item",
  requires_purchase: false,
  states_scope: "all",
  last_checked_on: "2026-11-01",
  source_url: "https://example.com/rewards",
  retired_at: retired ? new Date() : null,
});

beforeAll(async () => {
  await db`delete from public.retailers where id like 'rls-enroll-%'`;
  await db`insert into public.retailers ${db([
    retailer(LISTED, false),
    retailer(OTHER, false),
    retailer(RETIRED, true),
  ])}`;
  a = await createUser("enroll-a");
  b = await createUser("enroll-b");
  const { error } = await a.client
    .from("enrollments")
    .insert({ user_id: a.id, retailer_id: LISTED });
  if (error) throw new Error(`setup enroll failed: ${error.message}`);
});

afterAll(async () => {
  await deleteUsers(a, b); // cascades their enrollments
  await db`delete from public.retailers where id like 'rls-enroll-%'`;
  await db.end();
});

const rowsOf = async (userId: string) =>
  (
    await adminClient()
      .from("enrollments")
      .select("retailer_id")
      .eq("user_id", userId)
  ).data?.map((r) => r.retailer_id);

describe("public.enrollments: own rows only (NFR-1)", () => {
  it("A reads exactly their own enrollments", async () => {
    const { data, error } = await a.client
      .from("enrollments")
      .select("user_id, retailer_id");
    expect(error).toBeNull();
    expect(data).toEqual([{ user_id: a.id, retailer_id: LISTED }]);
  });

  it("B can't read A's enrollments", async () => {
    const { data } = await b.client
      .from("enrollments")
      .select("retailer_id")
      .eq("user_id", a.id);
    expect(data).toEqual([]);
  });

  it("B can't enroll A", async () => {
    const { error } = await b.client
      .from("enrollments")
      .insert({ user_id: a.id, retailer_id: OTHER });
    expect(error?.code).toBe("42501");
    expect(await rowsOf(a.id)).toEqual([LISTED]);
  });

  it("B can't delete A's enrollment", async () => {
    await b.client
      .from("enrollments")
      .delete()
      .eq("user_id", a.id)
      .eq("retailer_id", LISTED);
    expect(await rowsOf(a.id)).toEqual([LISTED]);
  });

  it("a signed-out visitor can't read or write any", async () => {
    const anon = publicClient();
    const { data } = await anon.from("enrollments").select("retailer_id");
    expect(data ?? []).toEqual([]);
    const { error } = await anon
      .from("enrollments")
      .insert({ user_id: a.id, retailer_id: OTHER });
    expect(error?.code).toBe("42501");
  });

  it("A can't join a retired retailer (BR-3 at the database)", async () => {
    const { error } = await a.client
      .from("enrollments")
      .insert({ user_id: a.id, retailer_id: RETIRED });
    expect(error?.code).toBe("42501");
  });

  it("A can't set created_at (insert grant covers only user_id and retailer_id)", async () => {
    const { error } = await a.client.from("enrollments").insert({
      user_id: a.id,
      retailer_id: OTHER,
      created_at: "2000-01-01T00:00:00Z",
    });
    expect(error?.code).toBe("42501");
  });

  it("A can leave their own program", async () => {
    await a.client
      .from("enrollments")
      .insert({ user_id: a.id, retailer_id: OTHER });
    const { error } = await a.client
      .from("enrollments")
      .delete()
      .eq("user_id", a.id)
      .eq("retailer_id", OTHER);
    expect(error).toBeNull();
    expect(await rowsOf(a.id)).toEqual([LISTED]);
  });
});
