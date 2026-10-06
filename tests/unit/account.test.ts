import { beforeEach, describe, expect, it, vi } from "vitest";
import { msg } from "@/lib/messages";
import { displayNameSchema } from "@/lib/validation/account";

// Settings actions (BUILD F-11, FR-12, FR-14, D9, D24.1, D24.4) and the display-name schema
// (§0.5). Supabase, the limiter's DB and Next's request APIs are the faked boundaries.

const update = vi.fn();
const auth = { updateUser: vi.fn(), signOut: vi.fn() };
const rpc = vi.fn();
const state = {
  passwordSetAt: "2026-09-29T00:00:00Z" as string | null,
  amrAge: 60, // seconds since the newest sign-in method
  provider: "email",
};

vi.mock("@/server/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      ...auth,
      getUser: async () => ({
        data: {
          user: {
            id: "user-1",
            email: "someone@example.com",
            email_confirmed_at: "2026-09-29T00:00:00Z",
            identities: [{ provider: state.provider }],
            factors: [],
          },
        },
        error: null,
      }),
      getClaims: async () => ({
        data: {
          claims: {
            aal: "aal1",
            amr: [
              {
                method: "password",
                timestamp: Date.now() / 1000 - state.amrAge,
              },
            ],
          },
        },
      }),
    },
    rpc,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { password_set_at: state.passwordSetAt },
            error: null,
          }),
        }),
      }),
      update: (values: unknown) => ({
        eq: (col: string, id: string) => ({
          select: () => update(values, col, id),
        }),
      }),
    }),
  }),
}));
vi.mock("@/server/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const deleteUser = vi.fn();
vi.mock("@/server/supabase/admin", () => ({
  getAdminClient: () => ({ auth: { admin: { deleteUser } } }),
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": "/settings" }),
  cookies: async () => ({ getAll: () => [], delete: () => {} }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
  },
}));

const { updateDisplayName, changePassword, deleteAccount } =
  await import("@/server/actions/account");

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};
async function run(
  action: (p: null, f: FormData) => Promise<unknown>,
  fd: FormData,
) {
  try {
    return await action(null, fd);
  } catch (error) {
    return { redirect: (error as { url: string }).url };
  }
}

beforeEach(() => {
  update
    .mockReset()
    .mockResolvedValue({ data: [{ id: "user-1" }], error: null });
  auth.updateUser.mockReset().mockResolvedValue({ error: null });
  auth.signOut.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
  state.passwordSetAt = "2026-09-29T00:00:00Z";
  state.amrAge = 60;
  state.provider = "email";
  deleteUser.mockReset().mockResolvedValue({ error: null });
});

describe("displayNameSchema (M-35..M-37)", () => {
  const errors = (v: string) => {
    const r = displayNameSchema.safeParse(v);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };
  it("trims; empty or whitespace-only → M-35", () => {
    expect(displayNameSchema.parse("  Sam  ")).toBe("Sam");
    expect(errors("   ")).toContain(msg("M-35"));
  });
  it("80 code points pass, 81 → M-36 (emoji count as one, like char_length)", () => {
    expect(errors("😀".repeat(80))).toEqual([]);
    expect(errors("a".repeat(81))).toContain(msg("M-36"));
  });
  it("control characters → M-37", () => {
    expect(errors("Sam\nSmith")).toContain(msg("M-37"));
    expect(errors("Sam\tSmith")).toContain(msg("M-37"));
  });
});

describe("updateDisplayName (S-14)", () => {
  it("saves the trimmed name on the user's own row → M-21", async () => {
    expect(
      await run(updateDisplayName, form({ displayName: "  Sam " })),
    ).toEqual({
      ok: true,
      message: "M-21",
    });
    expect(update).toHaveBeenCalledWith(
      { display_name: "Sam" },
      "id",
      "user-1",
    );
  });
  it("0 rows changed (e.g. filtered by RLS) → M-7, never a false 'saved' (#19 review)", async () => {
    update.mockResolvedValue({ data: [], error: null });
    expect(await run(updateDisplayName, form({ displayName: "Sam" }))).toEqual({
      ok: false,
      error: "M-7",
    });
  });

  it("refuses unknown fields (no writing other columns)", async () => {
    expect(
      await run(
        updateDisplayName,
        form({ displayName: "Sam", password_set_at: "x" }),
      ),
    ).toMatchObject({ ok: false, error: "API-4" });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("changePassword (S-15)", () => {
  const valid = () => form({ password: "a-long-new-password-1" });

  it("recent + has a password: changes it, records it, signs out the others → M-22", async () => {
    expect(await run(changePassword, valid())).toEqual({
      ok: true,
      message: "M-22",
    });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(rpc).toHaveBeenCalledWith("mark_password_set");
  });

  it("not recent (D9) → the constant re-auth redirect, nothing changed", async () => {
    state.amrAge = 11 * 60;
    expect(await run(changePassword, valid())).toEqual({
      redirect: "/auth/reauthenticate?next=/settings",
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("a Google-only account (no password) → M-23", async () => {
    state.passwordSetAt = null;
    state.provider = "google";
    expect(await run(changePassword, valid())).toEqual({
      ok: false,
      error: "M-23",
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("the same password again → API-7 on the field", async () => {
    auth.updateUser.mockResolvedValue({ error: { code: "same_password" } });
    expect(await run(changePassword, valid())).toEqual({
      ok: false,
      error: "API-4",
      fieldErrors: { password: [msg("API-7")] },
    });
  });
});

describe("deleteAccount (S-18)", () => {
  it("deletes the verified user's id (never input), then goes home with the notice", async () => {
    expect(
      await run(deleteAccount, form({ email: "  SomeOne@Example.com " })),
    ).toEqual({ redirect: "/?notice=account_deleted" });
    expect(deleteUser).toHaveBeenCalledWith("user-1");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("a different email → M-24 on the field, nothing deleted", async () => {
    expect(
      await run(deleteAccount, form({ email: "other@example.com" })),
    ).toEqual({
      ok: false,
      error: "API-4",
      fieldErrors: { email: [msg("M-24")] },
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("not recent (D9) → re-auth first, before even reading the form (D12 order)", async () => {
    state.amrAge = 11 * 60;
    expect(await run(deleteAccount, form({}))).toEqual({
      redirect: "/auth/reauthenticate?next=/settings",
    });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("the admin delete failing → M-7, still signed in", async () => {
    deleteUser.mockResolvedValue({ error: { code: "unexpected_failure" } });
    expect(
      await run(deleteAccount, form({ email: "someone@example.com" })),
    ).toEqual({
      ok: false,
      error: "M-7",
    });
    expect(auth.signOut).not.toHaveBeenCalled();
  });
});
