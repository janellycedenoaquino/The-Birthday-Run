import { beforeEach, describe, expect, it, vi } from "vitest";

// BUILD F-2 `saveOnboarding`, step 2 (FR-7): runs once, all-or-nothing on BR-3, sets onboarded_at
// only where empty. Supabase, the guard and the limiter are the faked boundaries.
const state = {
  profile: {
    birth_month: 6 as number | null,
    time_zone: "UTC" as string | null,
    onboarded_at: null as string | null,
  },
  listed: [] as string[],
  insertError: null as { code: string } | null,
  writes: [] as string[],
};

const fakeClient = {
  from: (table: string) => {
    if (table === "profiles")
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: state.profile, error: null }),
          }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: () => ({
            is: async (col: string) => {
              state.writes.push(
                `profiles ${Object.keys(values).join()} where ${col} is null`,
              );
              return { error: null };
            },
          }),
        }),
      };
    if (table === "retailers")
      return {
        select: () => ({
          in: (_: string, ids: string[]) => ({
            is: async () => ({
              data: ids
                .filter((id) => state.listed.includes(id))
                .map((id) => ({ id })),
              error: null,
            }),
          }),
        }),
      };
    return {
      upsert: async (rows: { retailer_id: string }[]) => {
        state.writes.push(
          `enrollments ${rows.map((r) => r.retailer_id).join()}`,
        );
        return { error: state.insertError };
      },
    };
  },
};

vi.mock("@/server/auth/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/guards")>()),
  requireUser: async () => ({ supabase: fakeClient, user: { id: "user-1" } }),
}));
vi.mock("@/server/security/rate-limit", () => ({
  rateLimit: async () => ({ ok: true }),
}));
vi.mock("@/server/errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/errors")>()),
  logError: vi.fn(),
}));
vi.mock("next/navigation", () => import("./next-navigation-mock"));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { saveOnboarding } = await import("@/server/actions/profile");

const programs = (...ids: string[]) => {
  const fd = new FormData();
  fd.set("step", "programs");
  for (const id of ids) fd.append("retailerIds", id);
  return fd;
};
const outcome = async (fd: FormData) => {
  try {
    return await saveOnboarding(null, fd);
  } catch (error) {
    return { redirect: (error as { url?: string }).url };
  }
};

beforeEach(() => {
  state.profile = { birth_month: 6, time_zone: "UTC", onboarded_at: null };
  state.listed = ["starbucks", "sephora"];
  state.insertError = null;
  state.writes = [];
});

describe("saveOnboarding step 2 (FR-7)", () => {
  it("joins the chosen programs, marks onboarding done (only where empty), then the dashboard", async () => {
    expect(
      await outcome(programs("starbucks", "sephora", "starbucks")),
    ).toEqual({
      redirect: "/dashboard",
    });
    expect(state.writes).toEqual([
      "enrollments starbucks,sephora",
      "profiles onboarded_at where onboarded_at is null",
    ]);
  });

  it("Skip (no programs) still marks onboarding done", async () => {
    expect(await outcome(programs())).toEqual({ redirect: "/dashboard" });
    expect(state.writes).toEqual([
      "profiles onboarded_at where onboarded_at is null",
    ]);
  });

  it("one retired or unknown ID → BR-3 and nothing saved", async () => {
    expect(await outcome(programs("starbucks", "gone"))).toEqual({
      ok: false,
      error: "BR-3",
    });
    expect(state.writes).toEqual([]);
  });

  it("no birthday yet → BR-1", async () => {
    state.profile.birth_month = null;
    expect(await outcome(programs("starbucks"))).toEqual({
      ok: false,
      error: "BR-1",
    });
    expect(state.writes).toEqual([]);
  });

  it("after onboarding it's a no-op, not a bulk enroll endpoint", async () => {
    state.profile.onboarded_at = "2026-11-23T00:00:00Z";
    expect(await outcome(programs("starbucks", "sephora"))).toEqual({
      redirect: "/dashboard",
    });
    expect(state.writes).toEqual([]);
  });

  it("a bad ID → API-4 before any read or write", async () => {
    expect(await outcome(programs("Not A Slug"))).toEqual({
      ok: false,
      error: "API-4",
    });
    expect(state.writes).toEqual([]);
  });
});
