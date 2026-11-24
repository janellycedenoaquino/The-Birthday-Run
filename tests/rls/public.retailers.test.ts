import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createUser,
  deleteUsers,
  publicClient,
  sql,
  type TestUser,
} from "./helpers";

// public.retailers RLS and grants (BUILD F-1 "Tests": D3, FR-2, decision 0017). Rows are seeded as `postgres`
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
  // Leftovers from a crashed run would fail the insert below.
  await db`delete from public.retailers where id like ${PREFIX + "%"}`;
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
  it("anon sees every non-retired row, popular or not (decision 0017)", async () => {
    const { data, error } = await publicClient().from("retailers").select("id");
    expect(error).toBeNull();
    expect(seededIds(data)).toEqual([ids.hidden, ids.popular].sort());
  });

  it("anon gets 0 rows for a retired id", async () => {
    const { data } = await publicClient()
      .from("retailers")
      .select("id")
      .eq("id", ids.retiredPopular);
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

  it("only the owner has write privileges: anon, authenticated and service_role can only SELECT", async () => {
    const grants = await db<{ grantee: string; privilege: string }[]>`
      select grantee, privilege_type as privilege
      from information_schema.role_table_grants
      where table_schema = 'public' and table_name = 'retailers'
        and grantee in ('PUBLIC', 'anon', 'authenticated', 'service_role')
      order by 1, 2`;
    expect(grants).toEqual([
      { grantee: "anon", privilege: "SELECT" },
      { grantee: "authenticated", privilege: "SELECT" },
      { grantee: "service_role", privilege: "SELECT" },
    ]);
  });

  it("PUBLIC can't execute retailer_counts()", async () => {
    const [r] = await db<{ ok: boolean }[]>`
      select exists (
        select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where p.oid = 'public.retailer_counts()'::regprocedure
          and a.grantee = 0 and a.privilege_type = 'EXECUTE'
      ) as ok`;
    expect(r?.ok).toBe(false);
  });
});

// The table's own CHECKs are the backstop behind the CSV checker (FR-1, FR-11): bad rows written
// as the owner must still fail. Each case runs in a rolled-back savepoint.
describe("public.retailers CHECK constraints (FR-1, FR-11)", () => {
  const bad = (cells: Record<string, unknown>) => ({
    ...row(`${PREFIX}bad`, false, false),
    ...cells,
  });
  it.each<[string, Record<string, unknown>]>([
    ["from_birthday with NULL days_after", { timing_type: "from_birthday" }],
    ["from_birthday 0 days", { timing_type: "from_birthday", days_after: 0 }],
    ["from_birthday 32 days", { timing_type: "from_birthday", days_after: 32 }],
    ["around_birthday with NULL days", { timing_type: "around_birthday" }],
    [
      "around_birthday over 31",
      { timing_type: "around_birthday", days_before: 16, days_after: 15 },
    ],
    ["birth_month with days", { days_after: 7 }],
    ["month_start with NULL days", { timing_type: "month_start" }],
    ["month_start 32 days", { timing_type: "month_start", days_after: 32 }],
    ["to_month_end with days", { timing_type: "to_month_end", days_after: 7 }],
    ["signup lead 0 days", { signup_lead_days: 0 }],
    ["signup lead 91 days", { signup_lead_days: 91 }],
    ["listed with no codes", { states_scope: "listed" }],
    [
      "listed with a NULL code",
      { states_scope: "listed", state_codes: [null] },
    ],
    ["all with codes", { state_codes: ["NY"] }],
    ["lower-case code", { states_scope: "listed", state_codes: ["ny"] }],
    ["blank description", { description: "  " }],
    ["blank reward", { reward_description: "" }],
    ["name with outer spaces", { name: " padded " }],
    ["bare https:// source", { source_url: "https://" }],
    ["http: website", { website_url: "http://example.com" }],
    ["bad id", { id: "Not A Slug" }],
  ])("rejects %s", async (_, cells) => {
    await expect(
      db.begin(async (tx) => {
        await tx`insert into public.retailers ${tx(bad(cells))}`;
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
