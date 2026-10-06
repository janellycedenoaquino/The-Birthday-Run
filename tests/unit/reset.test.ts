import { beforeEach, describe, expect, it, vi } from "vitest";

// Password reset (BUILD F-8, FR-7, FR-8, D24.1, D24.4, D24.6; decisions/0014): the signed
// recovery marker, requestPasswordReset and updatePasswordFromReset. Supabase, the limiter's DB
// and Next's request APIs are the faked boundaries.

const auth = {
  resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
  getClaims: vi.fn(),
};
const rpc = vi.fn();
const cookieJar = new Map<string, string>();

vi.mock("@/server/supabase/server", () => ({
  createClient: async () => ({
    auth,
    rpc,
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
  rateLimit: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@/server/site-url", () => ({
  getSiteUrl: () => "https://app.example",
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": "/reset-password" }),
  cookies: async () => ({
    getAll: () => [],
    get: (name: string) =>
      cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
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

const { signRecoveryMarker, verifyRecoveryMarker } =
  await import("@/server/auth/recovery");
const { requestPasswordReset, updatePasswordFromReset } =
  await import("@/server/actions/auth");

const NOW = Date.parse("2026-09-29T12:00:00Z");
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
  rpc.mockReset().mockResolvedValue({ data: true, error: null });
  cookieJar.clear();
  auth.getUser.mockResolvedValue({
    data: {
      user: {
        id: "user-1",
        email: "someone@example.com",
        email_confirmed_at: "2026-09-29T00:00:00Z",
        identities: [{ provider: "email" }],
        factors: [],
      },
    },
    error: null,
  });
  auth.getClaims.mockResolvedValue({
    data: {
      claims: {
        aal: "aal1",
        session_id: "session-1",
        amr: [{ method: "otp", timestamp: NOW / 1000 }],
      },
    },
  });
  auth.updateUser.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
});

describe("the signed recovery marker (decisions/0014)", () => {
  it("verifies for the same user and session within 15 minutes", () => {
    const marker = signRecoveryMarker("user-1", "session-1", NOW);
    expect(
      verifyRecoveryMarker(marker, "user-1", "session-1", NOW + 14 * 60_000),
    ).toBe(true);
  });

  const marker = () => signRecoveryMarker("user-1", "session-1", NOW);
  it.each([
    ["another user", () => [marker(), "user-2", "session-1", NOW]],
    [
      "another session, e.g. a later sign-in (#15 review)",
      () => [marker(), "user-1", "session-2", NOW],
    ],
    ["no session id", () => [marker(), "user-1", undefined, NOW]],
    [
      "after 15 minutes",
      () => [marker(), "user-1", "session-1", NOW + 15 * 60_000 + 1],
    ],
    ["issued in the future", () => [marker(), "user-1", "session-1", NOW - 1]],
    ["a bare marker", () => ["1", "user-1", "session-1", NOW]],
    [
      "a tampered time",
      () => [`${NOW + 1}${marker().slice(13)}`, "user-1", "session-1", NOW + 1],
    ],
    [
      "a tampered MAC",
      () => [`${marker().slice(0, -2)}AA`, "user-1", "session-1", NOW],
    ],
    ["nothing", () => [undefined, "user-1", "session-1", NOW]],
  ] as const)("refuses %s", (_why, args) => {
    const [value, user, session, now] = args() as [
      string | undefined,
      string,
      string | undefined,
      number,
    ];
    expect(verifyRecoveryMarker(value, user, session, now)).toBe(false);
  });
});

describe("requestPasswordReset (S-6)", () => {
  const valid = () =>
    form({ email: "Someone@Example.com", "cf-turnstile-response": "tok" });

  it.each([
    ["an existing or unknown email", null],
    ["Supabase's resend rule", { code: "over_email_send_rate_limit" }],
    ["an unexpected error (logged)", { code: "unexpected_failure" }],
  ])("%s → the same M-3", async (_why, error) => {
    auth.resetPasswordForEmail.mockResolvedValue({ error });
    expect(await run(requestPasswordReset, valid())).toEqual({
      ok: true,
      message: "M-3",
    });
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "someone@example.com",
      {
        captchaToken: "tok",
        redirectTo: "https://app.example/auth/confirm",
      },
    );
  });

  it("a rejected CAPTCHA → M-6", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({
      error: { code: "captcha_failed" },
    });
    expect(await run(requestPasswordReset, valid())).toEqual({
      ok: false,
      error: "M-6",
    });
  });
});

describe("updatePasswordFromReset (S-7)", () => {
  const valid = () => form({ password: "a-long-new-password-1" });

  it("without a valid marker (amr is only 'otp') → M-13, nothing changed", async () => {
    expect(await run(updatePasswordFromReset, valid())).toEqual({
      ok: false,
      error: "M-13",
    });
    cookieJar.set("auth_recovery", "1"); // a bare marker never counts
    expect(await run(updatePasswordFromReset, valid())).toEqual({
      ok: false,
      error: "M-13",
    });
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("with the signed marker: saves, records it, signs out the others, clears the marker", async () => {
    cookieJar.set(
      "auth_recovery",
      signRecoveryMarker("user-1", "session-1", Date.now()),
    );
    expect(await run(updatePasswordFromReset, valid())).toEqual({
      redirect: "/dashboard?notice=password_changed",
    });
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: "a-long-new-password-1",
    });
    expect(rpc).toHaveBeenCalledWith("mark_password_set");
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "others" });
    expect(cookieJar.has("auth_recovery")).toBe(false);
  });

  it("the old password again → API-7 on the password field", async () => {
    cookieJar.set(
      "auth_recovery",
      signRecoveryMarker("user-1", "session-1", Date.now()),
    );
    auth.updateUser.mockResolvedValue({ error: { code: "same_password" } });
    expect(await run(updatePasswordFromReset, valid())).toEqual({
      ok: false,
      error: "API-4",
      fieldErrors: {
        password: ["Choose a password you haven't used for this account."],
      },
    });
  });
});

describe("requestPasswordReset timing (NFR-12, D24.10)", () => {
  it("answers no sooner than 500 ms, whatever the outcome", async () => {
    vi.useFakeTimers();
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    let done = false;
    const pending = run(
      requestPasswordReset,
      form({ email: "a@b.co", "cf-turnstile-response": "t" }),
    ).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(499);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(done).toBe(true);
    vi.useRealTimers();
  });
});
