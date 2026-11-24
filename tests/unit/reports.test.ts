import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuardError } from "@/server/auth/guards";

// BUILD F-13 "Tests": reportReward (FR-48, NFR-11). Supabase, the guard and the limiter are the
// faked boundaries; RLS and the one-per-cycle key are tested in tests/rls/public.reward_reports.
const state = {
  guard: null as GuardError | null,
  insertError: null as { code: string } | null,
  limited: false,
  rows: [] as Record<string, unknown>[],
};
const fakeClient = {
  from: () => ({
    insert: async (row: Record<string, unknown>) => {
      if (!state.insertError) state.rows.push(row);
      return { error: state.insertError };
    },
  }),
};
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/errors", async (io) =>
  (await import("./mock-helpers")).quietErrors(io),
);
vi.mock("@/server/auth/app-guards", () => ({
  requireOnboarded: async () => {
    if (state.guard) throw state.guard;
    return {
      supabase: fakeClient,
      user: { id: "user-1" },
      profile: { birthday: { month: 3, day: 10 }, timeZone: "UTC" },
    };
  },
}));
vi.mock("@/server/security/rate-limit", () => ({
  rateLimit: async () =>
    state.limited ? { ok: false, error: "M-5" } : { ok: true },
}));

const { reportReward } = await import("@/server/actions/reports");
const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};

beforeEach(() => {
  state.guard = null;
  state.insertError = null;
  state.limited = false;
  state.rows = [];
});

describe("reportReward (FR-48, NFR-11)", () => {
  it("stores one row with the reason and thanks the user (BR-20)", async () => {
    expect(
      await reportReward(
        null,
        form({ retailerId: "starbucks", reason: "wrong_timing" }),
      ),
    ).toEqual({ ok: true, message: "BR-20" });
    expect(state.rows).toHaveLength(1);
    expect(state.rows[0]).toMatchObject({
      user_id: "user-1",
      retailer_id: "starbucks",
      reason: "wrong_timing",
    });
    expect(Object.keys(state.rows[0]!).sort()).toEqual([
      "cycle_start",
      "reason",
      "retailer_id",
      "user_id",
    ]);
  });

  it.each([
    ["an unknown reason", { retailerId: "starbucks", reason: "rude_staff" }],
    ["no reason", { retailerId: "starbucks" }],
    [
      "an extra note field",
      { retailerId: "starbucks", reason: "expired", note: "call me" },
    ],
    ["a bad retailer ID", { retailerId: "Not A Slug", reason: "expired" }],
  ])("%s → API-4, nothing stored", async (_, fields) => {
    const r = await reportReward(null, form(fields));
    expect(r).toMatchObject({ ok: false, error: "API-4" });
    expect(state.rows).toEqual([]);
  });

  it("a second report this cycle → BR-14", async () => {
    state.insertError = { code: "23505" };
    expect(
      await reportReward(
        null,
        form({ retailerId: "starbucks", reason: "expired" }),
      ),
    ).toEqual({ ok: false, error: "BR-14" });
  });

  it.each([["42501"], ["23503"]])(
    "a retired or unknown retailer (%s) → BR-3",
    async (code) => {
      state.insertError = { code };
      expect(
        await reportReward(
          null,
          form({ retailerId: "gone", reason: "store_closed" }),
        ),
      ).toEqual({ ok: false, error: "BR-3" });
    },
  );

  it("rate limited → M-5, nothing stored", async () => {
    state.limited = true;
    expect(
      await reportReward(
        null,
        form({ retailerId: "starbucks", reason: "expired" }),
      ),
    ).toEqual({ ok: false, error: "M-5" });
    expect(state.rows).toEqual([]);
  });

  it("not onboarded → BR-1", async () => {
    state.guard = new GuardError("not_onboarded");
    expect(
      await reportReward(
        null,
        form({ retailerId: "starbucks", reason: "expired" }),
      ),
    ).toMatchObject({ ok: false, error: "BR-1" });
  });

  it("any other database error → M-7", async () => {
    state.insertError = { code: "XX000" };
    expect(
      await reportReward(
        null,
        form({ retailerId: "starbucks", reason: "expired" }),
      ),
    ).toEqual({ ok: false, error: "M-7" });
  });
});
