import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocalDate } from "@/lib/birthday/timing";
import { plannable } from "@/lib/rewards/plan";

// BUILD F-6 "Tests": createGroup/addToGroup results (FR-23, FR-24, FR-25, FR-26). The plan
// context, Supabase, the guard and the limiter are the faked boundaries; the triggers and
// constraints themselves are tested in tests/rls/public.reward_group*.test.ts.
const ctx = plannable({
  birthday: { month: 6, day: 15 },
  today: "2026-06-15" as LocalDate,
  enrolled: [
    {
      id: "one",
      name: "One Day",
      logo_file: null,
      timing_type: "from_birthday",
      days_before: null,
      days_after: 1,
    },
    {
      id: "week",
      name: "Week",
      logo_file: null,
      timing_type: "from_birthday",
      days_before: null,
      days_after: 7,
    },
    {
      id: "done",
      name: "Done",
      logo_file: null,
      timing_type: "from_birthday",
      days_before: null,
      days_after: 7,
    },
  ],
  pickups: [{ retailerId: "done", date: "2026-06-15" as LocalDate }],
});

const state = {
  groupError: null as {
    code?: string;
    message?: string;
    details?: string;
  } | null,
  itemsError: null as {
    code?: string;
    message?: string;
    details?: string;
  } | null,
  writes: [] as string[],
};
const fakeClient = {
  from: (table: string) => ({
    insert: (rows: unknown) => {
      state.writes.push(`insert ${table} ${JSON.stringify(rows)}`);
      if (table === "reward_groups")
        return {
          select: () => ({
            single: async () =>
              state.groupError
                ? { data: null, error: state.groupError }
                : { data: { id: "g1" }, error: null },
          }),
        };
      return Promise.resolve({ error: state.itemsError });
    },
    delete: () => ({
      eq: async (_: string, id: string) => {
        state.writes.push(`delete ${table} ${id}`);
        return { error: null };
      },
    }),
  }),
};

vi.mock("@/server/auth/app-guards", () => ({
  requireOnboarded: async () => ({
    supabase: fakeClient,
    user: { id: "user-1" },
    profile: {},
  }),
}));
vi.mock("@/server/rewards/plan-context", () => ({
  loadPlanContext: async () => ({
    ...ctx,
    today: "2026-06-15",
    nowTime: "10:00",
  }),
}));
vi.mock("@/server/errors", async (io) =>
  (await import("./mock-helpers")).quietErrors(io),
);
vi.mock(
  "@/server/security/rate-limit",
  async () => (await import("./mock-helpers")).allowAll,
);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { createGroup } = await import("@/server/actions/groups");
const form = (fields: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields))
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  return fd;
};
const base = { name: "Plan A", pickupDate: "2026-06-16", pickupTime: "12:00" };

beforeEach(() => {
  state.groupError = null;
  state.itemsError = null;
  state.writes = [];
});

describe("createGroup (FR-23)", () => {
  it("creates the group, then its items in order; warns about rewards ending first (M-227)", async () => {
    const r = await createGroup(
      null,
      form({ ...base, retailerIds: ["week", "one"] }),
    );
    expect(r).toEqual({
      ok: true,
      data: { groupId: "g1" },
      message: "These end before your pickup: One Day. You can still save.",
    });
    expect(state.writes[1]).toContain('"retailer_id":"week","position":1');
    expect(state.writes[1]).toContain('"retailer_id":"one","position":2');
  });

  it.each([
    ["earlier today", { pickupDate: "2026-06-15", pickupTime: "09:00" }],
    ["after the window", { pickupDate: "2026-07-16" }],
  ])("a pickup %s → BR-8 on the date, nothing written", async (_, over) => {
    const r = await createGroup(null, form({ ...base, ...over }));
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: {
        pickupDate: ["Choose a date and time between Jun 15 and Jul 15."],
      },
    });
    expect(state.writes).toEqual([]);
  });

  it("a picked-up reward → BR-10; one that isn't a plannable program → BR-22", async () => {
    expect(
      await createGroup(null, form({ ...base, retailerIds: ["done"] })),
    ).toEqual({ ok: false, error: "BR-10" });
    expect(
      await createGroup(null, form({ ...base, retailerIds: ["nope"] })),
    ).toEqual({ ok: false, error: "BR-22" });
    expect(state.writes).toEqual([]);
  });

  it("the database's refusals map: limit → BR-4 with the number; same name → BR-6 on the name", async () => {
    state.groupError = {
      code: "P0001",
      message: "plan_group_limit",
      details: "3",
    };
    expect(await createGroup(null, form(base))).toEqual({
      ok: false,
      error: "API-4",
      fieldErrors: { form: ["You've reached the free limit of 3 groups."] },
    });
    state.groupError = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "reward_groups_user_name_key"',
    };
    expect(await createGroup(null, form(base))).toEqual({
      ok: false,
      error: "API-4",
      fieldErrors: { name: ["You already have a group with this name."] },
    });
  });

  it("items over the limit → BR-5, and the new group is deleted (no partial add)", async () => {
    state.itemsError = {
      code: "P0001",
      message: "plan_item_limit",
      details: "5",
    };
    const r = await createGroup(null, form({ ...base, retailerIds: ["week"] }));
    expect(r).toEqual({
      ok: false,
      error: "API-4",
      fieldErrors: {
        form: [
          "A group can hold up to 5 rewards. Choose fewer or remove some first.",
        ],
      },
    });
    expect(state.writes.at(-1)).toBe("delete reward_groups g1");
  });

  it("a blank name → M-35 on the name before any write", async () => {
    const r = await createGroup(null, form({ ...base, name: "  " }));
    expect(r).toMatchObject({
      ok: false,
      error: "API-4",
      fieldErrors: { name: ["Enter a name."] },
    });
    expect(state.writes).toEqual([]);
  });
});
