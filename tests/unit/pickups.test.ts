import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// BUILD F-5 "Tests" (FR-17): createPickup's rules with a fixed clock. Supabase, the guard and the
// limiter are faked; create_pickup itself is tested in tests/rls/public.pickups.test.ts.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-06-18T16:00:00Z")); // Jun 18 in New York: day 3 of a Jun 15 birthday

const state = {
  enrolled: [] as {
    id: string;
    retired_at: null;
    timing_type: string;
    days_before: number | null;
    days_after: number | null;
  }[],
  pickups: [] as { picked_up_on: string }[],
  listed: null as { retired_at: string | null } | null,
  rpcError: null as { message: string } | null,
  rpcArgs: null as Record<string, unknown> | null,
};

const fakeClient = {
  from: (table: string) => ({
    select: () =>
      table === "enrollments"
        ? {
            is: async () => ({
              data: state.enrolled.map((r) => ({ retailer: r })),
              error: null,
            }),
          }
        : table === "pickups"
          ? { eq: async () => ({ data: state.pickups, error: null }) }
          : {
              eq: () => ({
                maybeSingle: async () => ({ data: state.listed, error: null }),
              }),
            },
  }),
  rpc: async (_: string, args: Record<string, unknown>) => {
    state.rpcArgs = args;
    return state.rpcError
      ? { data: null, error: state.rpcError }
      : { data: "pickup-1", error: null };
  },
};

vi.mock("@/server/auth/app-guards", () => ({
  requireOnboarded: async () => ({
    supabase: fakeClient,
    user: { id: "user-1" },
    profile: { birthday: { month: 6, day: 15 }, timeZone: "America/New_York" },
  }),
}));
vi.mock("@/server/errors", async (io) =>
  (await import("./mock-helpers")).quietErrors(io),
);
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock(
  "@/server/security/rate-limit",
  async () => (await import("./mock-helpers")).allowAll,
);

const { createPickup } = await import("@/server/actions/pickups");
afterAll(() => vi.useRealTimers());

const week = {
  id: "starbucks",
  retired_at: null,
  timing_type: "from_birthday",
  days_before: null,
  days_after: 7,
};
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries({ retailerId: "starbucks", ...fields }))
    fd.set(k, v);
  return fd;
};

beforeEach(() => {
  state.enrolled = [week];
  state.pickups = [];
  state.listed = { retired_at: null };
  state.rpcError = null;
  state.rpcArgs = null;
});

describe("createPickup (FR-17)", () => {
  it("defaults to today; no cycle dates are sent (the database works them out)", async () => {
    expect(await createPickup(null, form({}))).toEqual({
      ok: true,
      message: "M-254",
      data: { pickupId: "pickup-1" },
    });
    expect(Object.keys(state.rpcArgs!).sort()).toEqual([
      "p_location_label",
      "p_note",
      "p_picked_up_on",
      "p_retailer_id",
    ]);
    expect(state.rpcArgs).toMatchObject({
      p_retailer_id: "starbucks",
      p_picked_up_on: "2026-06-18",
      p_note: null,
    });
  });

  it.each([
    ["the future", "2026-06-19"],
    ["before the window", "2026-06-14"],
  ])("a date in %s → BR-8 on the date field", async (_, date) => {
    const r = await createPickup(null, form({ pickedUpOn: date }));
    expect(r).toEqual({
      ok: false,
      error: "API-4",
      fieldErrors: { pickedUpOn: ["Choose a date between Jun 15 and Jun 18."] },
    });
    expect(state.rpcArgs).toBeNull();
  });

  it("not before this reward opened, even if another program opened earlier", async () => {
    // A birth-month program opens Jun 1; the 7-day one only on the birthday (Jun 15).
    state.enrolled = [
      week,
      { ...week, id: "month", timing_type: "birth_month", days_after: null },
    ];
    const r = await createPickup(null, form({ pickedUpOn: "2026-06-02" }));
    expect(r).toEqual({
      ok: false,
      error: "API-4",
      fieldErrors: { pickedUpOn: ["Choose a date between Jun 15 and Jun 18."] },
    });
  });

  it("an earlier day of the window is fine", async () => {
    expect(
      await createPickup(null, form({ pickedUpOn: "2026-06-15" })),
    ).toMatchObject({ ok: true });
  });

  it("already picked up this cycle → BR-9; expired → BR-10", async () => {
    state.pickups = [{ picked_up_on: "2026-06-16" }];
    expect(await createPickup(null, form({}))).toEqual({
      ok: false,
      error: "BR-9",
    });
    state.pickups = [];
    state.enrolled = [{ ...week, days_after: 1 }]; // birthday only: gone by Jun 18
    expect(await createPickup(null, form({}))).toEqual({
      ok: false,
      error: "BR-10",
    });
  });

  it("not joined → BR-22; retired or unknown → BR-3", async () => {
    state.enrolled = [];
    expect(await createPickup(null, form({}))).toEqual({
      ok: false,
      error: "BR-22",
    });
    state.listed = { retired_at: "2026-06-01T00:00:00Z" };
    expect(await createPickup(null, form({}))).toEqual({
      ok: false,
      error: "BR-3",
    });
    state.listed = null;
    expect(await createPickup(null, form({}))).toEqual({
      ok: false,
      error: "BR-3",
    });
  });

  it("the database's own refusals map to messages, never raw errors", async () => {
    state.rpcError = { message: "pickup_exists" };
    expect(await createPickup(null, form({}))).toEqual({
      ok: false,
      error: "BR-9",
    });
    state.rpcError = { message: "something else" };
    expect(await createPickup(null, form({}))).toEqual({
      ok: false,
      error: "M-7",
    });
  });

  it("a 501-character note → M-117 with the limit", async () => {
    const r = await createPickup(null, form({ note: "x".repeat(501) }));
    expect(r).toEqual({
      ok: false,
      error: "API-4",
      fieldErrors: { note: ["Use 500 characters or fewer."] },
    });
  });
});
