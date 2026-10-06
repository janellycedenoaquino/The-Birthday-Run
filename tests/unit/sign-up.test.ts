import { beforeEach, describe, expect, it, vi } from "vitest";

// signUp and setInitialPassword (BUILD F-6, FR-1, FR-2, NFR-12, D10, D24.1, D24.10). Supabase,
// the limiter's database and Next's request APIs are the faked boundaries; guards are real.

const otp = vi.fn();
const updateUser = vi.fn();
const markSet = vi.fn();
const state = {
  limit: { ok: true } as { ok: true } | { ok: false; error: "M-5" | "M-7" },
  passwordSetAt: null as string | null,
  identities: [{ provider: "email" }],
};

vi.mock("@/server/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithOtp: otp,
      updateUser,
      getUser: async () => ({
        data: {
          user: {
            id: "user-1",
            email: "someone@example.com",
            email_confirmed_at: "2026-09-29T00:00:00Z",
            identities: state.identities,
            factors: [],
          },
        },
        error: null,
      }),
      getClaims: async () => ({ data: { claims: { aal: "aal1", amr: [] } } }),
    },
    rpc: markSet,
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { password_set_at: state.passwordSetAt },
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
  headers: async () => new Headers({ "x-pathname": "/auth/set-password" }),
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
vi.mock("@/server/errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/errors")>()),
  logError: vi.fn(),
}));

const { signUp, setInitialPassword } = await import("@/server/actions/auth");
const { rateLimit } = await import("@/server/security/rate-limit");
const { logError } = await import("@/server/errors");

const form = (entries: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
};
const signUpForm = (email = "Someone@Example.com") =>
  form({ email, "cf-turnstile-response": "tok" });

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
  otp.mockReset().mockResolvedValue({ error: null });
  updateUser.mockReset().mockResolvedValue({ error: null });
  markSet.mockReset().mockResolvedValue({ data: true, error: null });
  vi.mocked(rateLimit).mockClear();
  vi.mocked(logError).mockClear();
  state.limit = { ok: true };
  state.passwordSetAt = null;
  state.identities = [{ provider: "email" }];
});

describe("signUp (S-5)", () => {
  it("asks Supabase for a link to the normalised email, creating the user, no password", async () => {
    expect(await signUp(null, signUpForm())).toEqual({
      ok: true,
      message: "M-1",
    });
    expect(otp).toHaveBeenCalledWith({
      email: "someone@example.com",
      options: {
        shouldCreateUser: true,
        captchaToken: "tok",
        emailRedirectTo: "https://app.example/auth/confirm",
      },
    });
    expect(rateLimit).toHaveBeenCalledWith("signUp", {
      email: "someone@example.com",
    });
  });

  it("refuses a password field (email first, D10) and a missing token (M-6)", async () => {
    expect(
      await signUp(
        null,
        form({ email: "a@b.co", password: "x", "cf-turnstile-response": "t" }),
      ),
    ).toMatchObject({ ok: false, error: "API-4" });
    expect(await signUp(null, form({ email: "a@b.co" }))).toEqual({
      ok: false,
      error: "M-6",
    });
    expect(otp).not.toHaveBeenCalled();
  });

  it.each([
    ["a new or existing email", null],
    ["Supabase's per-user resend rule", { code: "over_email_send_rate_limit" }],
    ["Supabase's 429", { code: "over_request_rate_limit" }],
    ["any other Supabase error (logged)", { code: "unexpected_failure" }],
  ])("%s → the same M-1 (NFR-12)", async (_why, error) => {
    otp.mockResolvedValue({ error });
    expect(await signUp(null, signUpForm())).toEqual({
      ok: true,
      message: "M-1",
    });
  });

  it("logs only the unexpected Supabase errors", async () => {
    otp.mockResolvedValue({ error: { code: "over_email_send_rate_limit" } });
    await signUp(null, signUpForm());
    expect(logError).not.toHaveBeenCalled();
    otp.mockResolvedValue({ error: { code: "unexpected_failure" } });
    await signUp(null, signUpForm());
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("a rejected CAPTCHA is the one different answer (M-6)", async () => {
    otp.mockResolvedValue({ error: { code: "captcha_failed" } });
    expect(await signUp(null, signUpForm())).toEqual({
      ok: false,
      error: "M-6",
    });
  });

  it("our limiter: M-5 before calling Supabase", async () => {
    state.limit = { ok: false, error: "M-5" };
    expect(await signUp(null, signUpForm())).toEqual({
      ok: false,
      error: "M-5",
    });
    expect(otp).not.toHaveBeenCalled();
  });

  it("takes at least 500 ms whatever happens (D24.10)", async () => {
    vi.useFakeTimers();
    let settled = false;
    const pending = signUp(null, signUpForm()).then(() => (settled = true));
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toBe(true);
    vi.useRealTimers();
  });
});

describe("setInitialPassword (S-9)", () => {
  const valid = (next = "/dashboard") =>
    form({ password: "a-long-new-password-1", next });

  it("sets the password, records it, and goes to next with the password_set notice", async () => {
    expect(await run(setInitialPassword, valid("/settings"))).toEqual({
      redirect: "/settings?notice=password_set",
    });
    expect(updateUser).toHaveBeenCalledWith({
      password: "a-long-new-password-1",
    });
    expect(markSet).toHaveBeenCalledWith("mark_password_set");
  });

  it("an unsafe next falls back to the dashboard", async () => {
    expect(await run(setInitialPassword, valid("//evil.example"))).toEqual({
      redirect: "/dashboard?notice=password_set",
    });
  });

  it("API-6 when a password is already set", async () => {
    state.passwordSetAt = "2026-09-29T00:00:00Z";
    expect(await run(setInitialPassword, valid())).toEqual({
      ok: false,
      error: "API-6",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("a Google account can't add a password here (only by reset, D24.1)", async () => {
    state.identities = [{ provider: "google" }];
    expect(await run(setInitialPassword, valid())).toEqual({
      ok: false,
      error: "M-7",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("too short → the M-32 field error, before anything else", async () => {
    const result = await run(setInitialPassword, form({ password: "short" }));
    expect(result).toMatchObject({ ok: false, error: "API-4" });
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it.each([
    ["weak_password", "Use at least 12 characters."],
    ["same_password", "Choose a password you haven't used for this account."],
  ])("Supabase %s → a password field error", async (code, text) => {
    updateUser.mockResolvedValue({ error: { code } });
    expect(await run(setInitialPassword, valid())).toEqual({
      ok: false,
      error: "API-4",
      fieldErrors: { password: [text] },
    });
  });

  it("mark_password_set failing → M-7, logged (a retry works)", async () => {
    markSet.mockResolvedValue({ data: false, error: null });
    expect(await run(setInitialPassword, valid())).toEqual({
      ok: false,
      error: "M-7",
    });
    expect(logError).toHaveBeenCalled();
  });

  it("rate limited → M-5 before the update", async () => {
    state.limit = { ok: false, error: "M-5" };
    expect(await run(setInitialPassword, valid())).toEqual({
      ok: false,
      error: "M-5",
    });
    expect(updateUser).not.toHaveBeenCalled();
  });
});

describe("setInitialPassword, #13 review", () => {
  const valid = (next = "/dashboard") =>
    form({ password: "a-long-new-password-1", next });

  it("an older session Supabase won't let set a password → M-41 (use the reset link)", async () => {
    updateUser.mockResolvedValue({
      error: { code: "reauthentication_needed" },
    });
    expect(await run(setInitialPassword, valid())).toEqual({
      ok: false,
      error: "M-41",
    });
  });

  it("next pointing back at a step page goes to the dashboard, keeping the notice", async () => {
    expect(await run(setInitialPassword, valid("/auth/set-password"))).toEqual({
      redirect: "/dashboard?notice=password_set",
    });
  });
});
