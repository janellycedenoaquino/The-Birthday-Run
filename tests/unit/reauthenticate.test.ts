import { beforeEach, describe, expect, it, vi } from "vitest";

// reauthenticateWithPassword (BUILD F-9, FR-56, D9): the §0.2 order and every outcome. Supabase,
// the limiter's database and Next's request APIs are the faked boundaries; the guard is real.

const signIn = vi.fn();
const state = {
  factors: [] as { status: string }[],
  limit: { ok: true } as { ok: true } | { ok: false; error: "M-5" | "M-7" },
};

vi.mock("@/server/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: "user-1",
            email: "someone@example.com",
            email_confirmed_at: "2026-09-29T00:00:00Z",
            identities: [{ provider: "email" }],
            factors: state.factors,
          },
        },
        error: null,
      }),
      getClaims: async () => ({
        data: {
          claims: { aal: state.factors.length ? "aal2" : "aal1", amr: [] },
        },
      }),
      signInWithPassword: signIn,
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { password_set_at: "2026-09-29T00:00:00Z" },
            error: null,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/server/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => state.limit),
}));
vi.mock("@/server/site-url", () => ({
  getSiteUrl: () => "https://app.example",
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": "/auth/reauthenticate" }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  unstable_rethrow: (e: unknown) => {
    if (e instanceof Error && e.message === "NEXT_REDIRECT") throw e;
  },
}));
vi.mock("@/server/errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/errors")>()),
  logError: vi.fn(),
}));

const { reauthenticateWithPassword } = await import("@/server/actions/auth");
const { rateLimit } = await import("@/server/security/rate-limit");

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};
const valid = (next = "/settings") =>
  form({ password: "the-password", "cf-turnstile-response": "tok", next });

async function run(fd: FormData) {
  try {
    return await reauthenticateWithPassword(null, fd);
  } catch (error) {
    return { redirect: (error as { url: string }).url };
  }
}

beforeEach(() => {
  signIn.mockReset().mockResolvedValue({ error: null });
  vi.mocked(rateLimit).mockClear();
  state.factors = [];
  state.limit = { ok: true };
});

describe("reauthenticateWithPassword", () => {
  it("signs in again with the verified user's email, never input, and returns to next", async () => {
    const fd = valid("/settings#security");
    fd.set("email", "attacker@example.com"); // refused: the schema is .strict()
    expect(await run(fd)).toMatchObject({ ok: false, error: "API-4" });

    expect(await run(valid("/settings"))).toEqual({ redirect: "/settings" });
    expect(signIn).toHaveBeenCalledWith({
      email: "someone@example.com",
      password: "the-password",
      options: { captchaToken: "tok" },
    });
    expect(rateLimit).toHaveBeenCalledWith("reauthenticateWithPassword", {
      userId: "user-1",
    });
  });

  it("an unsafe next falls back to /settings", async () => {
    expect(await run(valid("https://evil.example"))).toEqual({
      redirect: "/settings",
    });
  });

  it("MFA users go to /auth/mfa first, carrying next (the new session is aal1)", async () => {
    state.factors = [{ status: "verified" }];
    expect(await run(valid("/settings"))).toEqual({
      redirect: "/auth/mfa?next=%2Fsettings",
    });
  });

  it.each([
    ["invalid_credentials", "M-19"],
    ["captcha_failed", "M-6"],
    ["over_request_rate_limit", "M-5"],
    ["something_new", "M-7"],
  ])("Supabase %s → %s", async (code, id) => {
    signIn.mockResolvedValue({ error: { code } });
    expect(await run(valid())).toEqual({ ok: false, error: id });
  });

  it("rate limited → M-5 before any sign-in attempt", async () => {
    state.limit = { ok: false, error: "M-5" };
    expect(await run(valid())).toEqual({ ok: false, error: "M-5" });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("a missing Turnstile token → M-6 before the guard or limiter run", async () => {
    expect(await run(form({ password: "p" }))).toEqual({
      ok: false,
      error: "M-6",
    });
    expect(rateLimit).not.toHaveBeenCalled();
  });
});
