import { beforeEach, describe, expect, it, vi } from "vitest";
import { GuardError } from "@/server/auth/guards";

// BUILD F-3 "Tests": enroll/unenroll results (FR-8). Supabase, the guard and the limiter are the
// boundaries faked here; RLS itself is tested in tests/rls/public.enrollments.test.ts.
const state = {
  guard: null as GuardError | null,
  upsertError: null as { code: string } | null,
  deleteError: null as { code: string } | null,
  limited: false,
  calls: [] as string[],
};

const fakeClient = {
  from: () => ({
    upsert: async (row: unknown, opts: unknown) => {
      state.calls.push(`upsert ${JSON.stringify(row)} ${JSON.stringify(opts)}`);
      return { error: state.upsertError };
    },
    delete: () => ({
      eq: () => ({
        eq: async () => {
          state.calls.push("delete");
          return { error: state.deleteError };
        },
      }),
    }),
  }),
};

vi.mock("@/server/auth/app-guards", () => ({
  requireOnboarded: async () => {
    if (state.guard) throw state.guard;
    return { supabase: fakeClient, user: { id: "user-1" } };
  },
}));
vi.mock("@/server/security/rate-limit", () => ({
  rateLimit: async () =>
    state.limited ? { ok: false, error: "M-5" } : { ok: true },
}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/server/errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/errors")>()),
  logError: vi.fn(),
}));

const { enroll, unenroll } = await import("@/server/actions/enrollments");
const form = (retailerId: string) => {
  const fd = new FormData();
  fd.set("retailerId", retailerId);
  return fd;
};

beforeEach(() => {
  state.guard = null;
  state.upsertError = null;
  state.deleteError = null;
  state.limited = false;
  state.calls = [];
});

describe("enroll (FR-8)", () => {
  it("inserts once, ignoring a duplicate", async () => {
    expect(await enroll(null, form("starbucks"))).toEqual({ ok: true });
    expect(state.calls).toEqual([
      'upsert {"user_id":"user-1","retailer_id":"starbucks"} {"onConflict":"user_id,retailer_id","ignoreDuplicates":true}',
    ]);
  });

  it.each([
    ["a retired retailer (RLS)", "42501"],
    ["an unknown retailer (FK)", "23503"],
  ])("%s → BR-3", async (_, code) => {
    state.upsertError = { code };
    expect(await enroll(null, form("gone"))).toEqual({
      ok: false,
      error: "BR-3",
    });
  });

  it("not onboarded → BR-1, nothing written", async () => {
    state.guard = new GuardError("not_onboarded");
    expect(await enroll(null, form("starbucks"))).toEqual({
      ok: false,
      error: "BR-1",
    });
    expect(state.calls).toEqual([]);
  });

  it("a bad ID → API-4 before any guard or write", async () => {
    expect(await enroll(null, form("Not A Slug"))).toMatchObject({
      ok: false,
      error: "API-4",
    });
    expect(state.calls).toEqual([]);
  });

  it("rate limited → M-5", async () => {
    state.limited = true;
    expect(await enroll(null, form("starbucks"))).toEqual({
      ok: false,
      error: "M-5",
    });
  });

  it("another database error → M-7, never the raw error", async () => {
    state.upsertError = { code: "XX000" };
    expect(await enroll(null, form("starbucks"))).toEqual({
      ok: false,
      error: "M-7",
    });
  });
});

describe("unenroll (FR-8)", () => {
  it("deletes, and not being enrolled is fine", async () => {
    expect(await unenroll(null, form("starbucks"))).toEqual({ ok: true });
    expect(state.calls).toEqual(["delete"]);
  });
});
