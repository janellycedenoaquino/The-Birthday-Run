import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// signIn, requestMagicLink, signInWithGoogle (BUILD F-7, FR-3..FR-5, NFR-12, D11, D24.8, D24.10)
// and GET /auth/callback. Supabase, the limiter's DB, the welcome email and Next's request APIs are
// the faked boundaries.

const auth = {
  signInWithPassword: vi.fn(),
  signInWithOtp: vi.fn(),
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
};
const cookieJar = new Map<string, { value: string; options?: unknown }>();
const state = {
  limit: { ok: true } as { ok: true } | { ok: false; error: "M-5" | "M-7" },
};

vi.mock("@/server/supabase/server", () => ({
  createClient: async () => ({ auth }),
}));
vi.mock("@/server/security/rate-limit", () => ({
  rateLimit: vi.fn(async () => state.limit),
}));
vi.mock("@/server/email/welcome", () => ({ sendWelcomeIfFirst: vi.fn() }));
vi.mock("@/server/site-url", () => ({
  getSiteUrl: () => "https://app.example",
}));
vi.mock("@/server/env", () => ({
  env: { NEXT_PUBLIC_SITE_URL: "https://app.example" },
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    getAll: () => [],
    get: (name: string) => cookieJar.get(name),
    set: (name: string, value: string, options?: unknown) =>
      cookieJar.set(name, { value, options }),
    delete: (arg: string | { name: string }) =>
      cookieJar.delete(typeof arg === "string" ? arg : arg.name),
  }),
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

const { signIn, requestMagicLink, signInWithGoogle } =
  await import("@/server/actions/auth");
const { GET: callback } = await import("@/app/auth/callback/route");
const { sendWelcomeIfFirst } = await import("@/server/email/welcome");
const { logError } = await import("@/server/errors");

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
  for (const fn of Object.values(auth)) fn.mockReset();
  vi.mocked(sendWelcomeIfFirst).mockClear();
  vi.mocked(logError).mockClear();
  cookieJar.clear();
  state.limit = { ok: true };
});

describe("signIn (S-4 Password)", () => {
  const valid = (next?: string) =>
    form({
      email: "someone@example.com",
      password: "the-password",
      "cf-turnstile-response": "tok",
      ...(next && { next }),
    });

  it("signs in, sends the welcome once-check, and goes to next", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "u", email: "someone@example.com", factors: [] } },
      error: null,
    });
    expect(await run(signIn, valid("/settings"))).toEqual({
      redirect: "/settings",
    });
    expect(sendWelcomeIfFirst).toHaveBeenCalledTimes(1);
  });

  it("MFA users go to /auth/mfa with next", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "u", factors: [{ status: "verified" }] } },
      error: null,
    });
    expect(await run(signIn, valid())).toEqual({
      redirect: "/auth/mfa?next=%2Fdashboard",
    });
  });

  it.each([
    ["wrong password / unknown email", "invalid_credentials"],
    ["unconfirmed email", "email_not_confirmed"],
  ])("%s → the same M-4 after ≥ 500 ms (NFR-12)", async (_why, code) => {
    vi.useFakeTimers();
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code },
    });
    let result: unknown;
    const pending = run(signIn, valid()).then((r) => (result = r));
    await vi.advanceTimersByTimeAsync(499);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(result).toEqual({ ok: false, error: "M-4" });
    vi.useRealTimers();
  });

  it("no minimum password length at sign-in; empty → M-31", async () => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: { id: "u", factors: [] } },
      error: null,
    });
    const short = form({
      email: "a@b.co",
      password: "x",
      "cf-turnstile-response": "t",
    });
    expect(await run(signIn, short)).toEqual({ redirect: "/dashboard" });
    const empty = form({
      email: "a@b.co",
      password: "",
      "cf-turnstile-response": "t",
    });
    expect(await run(signIn, empty)).toMatchObject({
      ok: false,
      error: "API-4",
    });
  });

  it.each([
    ["captcha_failed", "M-6"],
    ["over_request_rate_limit", "M-5"],
  ])("Supabase %s → %s", async (code, id) => {
    auth.signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code },
    });
    expect(await run(signIn, valid())).toEqual({ ok: false, error: id });
  });
});

describe("requestMagicLink (S-4 Email link)", () => {
  const valid = (next?: string) =>
    form({
      email: "someone@example.com",
      "cf-turnstile-response": "tok",
      ...(next && { next }),
    });

  it("never creates an account (D11) and remembers next in auth_next", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    expect(await run(requestMagicLink, valid("/settings"))).toEqual({
      ok: true,
      message: "M-2",
    });
    expect(auth.signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(
      false,
    );
    expect(cookieJar.get("auth_next")).toEqual({
      value: "/settings",
      options: expect.objectContaining({
        httpOnly: true,
        path: "/auth",
        maxAge: 3600,
      }),
    });
  });

  it("an unsafe next is stored as the dashboard, never as given", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: null });
    await run(requestMagicLink, valid("https://evil.example"));
    expect(cookieJar.get("auth_next")?.value).toBe("/dashboard");
  });

  it.each([
    ["an unknown email (otp_disabled)", { code: "otp_disabled" }],
    ["Supabase's resend rule", { code: "over_email_send_rate_limit" }],
    ["an unexpected error (logged)", { code: "unexpected_failure" }],
  ])("%s → the same M-2", async (_why, error) => {
    auth.signInWithOtp.mockResolvedValue({ error });
    expect(await run(requestMagicLink, valid())).toEqual({
      ok: true,
      message: "M-2",
    });
  });

  it("logs only the unexpected ones", async () => {
    auth.signInWithOtp.mockResolvedValue({ error: { code: "otp_disabled" } });
    await run(requestMagicLink, valid());
    expect(logError).not.toHaveBeenCalled();
  });
});

describe("signInWithGoogle", () => {
  it("redirects to the provider URL, with the callback and auth_next set", async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: "http://127.0.0.1:54321/auth/v1/authorize?provider=google" },
      error: null,
    });
    expect(await run(signInWithGoogle, form({ next: "/settings" }))).toEqual({
      redirect: "http://127.0.0.1:54321/auth/v1/authorize?provider=google",
    });
    expect(auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://app.example/auth/callback",
        skipBrowserRedirect: true,
      },
    });
    expect(cookieJar.get("auth_next")?.value).toBe("/settings");
  });

  it("no URL → M-7; rate limited → M-5", async () => {
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: null,
    });
    expect(await run(signInWithGoogle, form({}))).toEqual({
      ok: false,
      error: "M-7",
    });
    state.limit = { ok: false, error: "M-5" };
    expect(await run(signInWithGoogle, form({}))).toEqual({
      ok: false,
      error: "M-5",
    });
  });
});

describe("GET /auth/callback", () => {
  const get = (query: string) =>
    callback(new NextRequest(`https://app.example/auth/callback${query}`));
  const where = (res: Response) => ({
    status: res.status,
    location:
      new URL(res.headers.get("location")!).pathname +
      new URL(res.headers.get("location")!).search,
    cache: res.headers.get("cache-control"),
  });

  it("a cancel (or no code) → S-4 with oauth_cancelled", async () => {
    expect(where(await get("?error=access_denied"))).toEqual({
      status: 303,
      location: "/sign-in?error=oauth_cancelled",
      cache: "private, no-store",
    });
    expect(where(await get("")).location).toBe(
      "/sign-in?error=oauth_cancelled",
    );
  });

  it("a failed exchange → S-8 oauth, logged", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: {},
      error: { code: "bad" },
    });
    expect(where(await get("?code=abc")).location).toBe(
      "/auth/error?reason=oauth",
    );
    expect(logError).toHaveBeenCalled();
  });

  it("success: welcome check, then auth_next (checked, deleted) or the dashboard", async () => {
    auth.exchangeCodeForSession.mockResolvedValue({
      data: { user: { id: "u", email: "g@example.com" } },
      error: null,
    });
    cookieJar.set("auth_next", { value: "/settings" });
    expect(where(await get("?code=abc")).location).toBe("/settings");
    expect(cookieJar.has("auth_next")).toBe(false);
    expect(sendWelcomeIfFirst).toHaveBeenCalledTimes(1);
    expect(where(await get("?code=abc")).location).toBe("/dashboard");
  });

  it("rate limited → S-8 rate_limited", async () => {
    state.limit = { ok: false, error: "M-5" };
    expect(where(await get("?code=abc")).location).toBe(
      "/auth/error?reason=rate_limited",
    );
  });
});

describe("auth_next hygiene and cancels (#14 review)", () => {
  const get = (query: string) =>
    callback(new NextRequest(`https://app.example/auth/callback${query}`));

  it("the callback clears auth_next on a cancel too", async () => {
    cookieJar.set("auth_next", { value: "/settings" });
    await get("?error=access_denied");
    expect(cookieJar.has("auth_next")).toBe(false);
  });

  it("any provider error is a cancel, even text too long for the schema", async () => {
    const res = await get(
      `?error=access_denied&error_description=${"x".repeat(2000)}`,
    );
    expect(new URL(res.headers.get("location")!).search).toBe(
      "?error=oauth_cancelled",
    );
  });

  it("an empty next clears an old auth_next (Google)", async () => {
    cookieJar.set("auth_next", { value: "/settings" });
    auth.signInWithOAuth.mockResolvedValue({
      data: { url: "https://x.test/a" },
      error: null,
    });
    await run(signInWithGoogle, form({}));
    expect(cookieJar.has("auth_next")).toBe(false);
  });

  it("a magic-link request that fails the CAPTCHA doesn't touch auth_next", async () => {
    cookieJar.set("auth_next", { value: "/old" });
    auth.signInWithOtp.mockResolvedValue({ error: { code: "captcha_failed" } });
    await run(
      requestMagicLink,
      form({ email: "a@b.co", "cf-turnstile-response": "t", next: "/new" }),
    );
    expect(cookieJar.get("auth_next")?.value).toBe("/old");
  });
});
