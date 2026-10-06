import { beforeEach, describe, expect, it, vi } from "vitest";

// BUILD F-2 "Guards" and §0.2 (FR-9, NFR-3; D2, D8, D9, D10, D24.1, D24.6). Supabase and Next's
// request APIs are the boundaries faked here; the signed-out refusal test in tests/rls runs the
// real client against local Supabase.

type FakeUser = {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  factors?: { status: string }[];
  identities?: { provider: string }[];
};

const state = {
  user: null as FakeUser | null,
  userError: null as unknown,
  claims: null as Record<string, unknown> | null,
  profile: { password_set_at: "2026-09-29T00:00:00Z" } as {
    password_set_at: string | null;
  } | null,
  profileError: null as unknown,
  pathname: "/settings",
};

const fakeClient = {
  auth: {
    getUser: async () => ({
      data: { user: state.user },
      error: state.userError,
    }),
    getClaims: async () => ({
      data: state.claims ? { claims: state.claims } : null,
      error: null,
    }),
  },
  from: () => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: state.profile,
          error: state.profileError,
        }),
      }),
    }),
  }),
};

vi.mock("@/server/supabase/server", () => ({
  createClient: async () => fakeClient,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-pathname": state.pathname }),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error(`NEXT_REDIRECT ${url}`), { url });
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT"))
      throw error;
  },
}));
vi.mock("@/server/errors", () => ({ logError: vi.fn() }));

const guards = await import("@/server/auth/guards");
const { runAction } = await import("@/server/run-action");
const {
  GuardError,
  isRecentSignIn,
  isRecoverySession,
  requireRecentSignIn,
  requireUser,
  withRefusals,
} = guards;

const NOW = Date.parse("2026-09-29T12:00:00Z");
const secondsAgo = (s: number) => NOW / 1000 - s;

const redirectOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (error) {
    return (error as { url?: string }).url;
  }
  return undefined;
};

const emailUser = (over: Partial<FakeUser> = {}): FakeUser => ({
  id: "user-1",
  email: "someone@example.com",
  email_confirmed_at: "2026-09-29T00:00:00Z",
  identities: [{ provider: "email" }],
  factors: [],
  ...over,
});

beforeEach(() => {
  state.user = emailUser();
  state.userError = null;
  state.claims = {
    aal: "aal1",
    amr: [{ method: "password", timestamp: secondsAgo(60) }],
  };
  state.profile = { password_set_at: "2026-09-29T00:00:00Z" };
  state.profileError = null;
  state.pathname = "/settings";
});

describe("isRecentSignIn (D9: 10 minutes)", () => {
  it.each([
    ["9 minutes ago", 9 * 60, true],
    ["exactly 10 minutes ago", 10 * 60, true],
    ["11 minutes ago", 11 * 60, false],
  ])("newest method %s → %s", (_what, age, expected) => {
    expect(isRecentSignIn([{ timestamp: secondsAgo(age) }], NOW)).toBe(
      expected,
    );
  });

  it("uses the newest entry, whatever the order", () => {
    const amr = [
      { timestamp: secondsAgo(60) },
      { timestamp: secondsAgo(3600) },
    ];
    expect(isRecentSignIn(amr, NOW)).toBe(true);
    expect(isRecentSignIn([...amr].reverse(), NOW)).toBe(true);
  });

  it("empty or missing amr → not recent", () => {
    expect(isRecentSignIn([], NOW)).toBe(false);
    expect(isRecentSignIn(undefined, NOW)).toBe(false);
  });
});

describe("isRecoverySession (D24.6: 15 minutes)", () => {
  const recovery = (age: number) => ({
    amr: [
      { method: "recovery", timestamp: secondsAgo(age) },
      { method: "totp", timestamp: secondsAgo(10) }, // the MFA step comes later (D24.5)
    ],
  });

  it("a recovery entry within the window, even when not the newest", () => {
    expect(isRecoverySession(recovery(14 * 60), NOW)).toBe(true);
  });

  it("outside the window, or only other methods → false", () => {
    expect(isRecoverySession(recovery(16 * 60), NOW)).toBe(false);
    expect(
      isRecoverySession(
        { amr: [{ method: "password", timestamp: secondsAgo(5) }] },
        NOW,
      ),
    ).toBe(false);
    expect(isRecoverySession({}, NOW)).toBe(false);
  });

  it("without an amr entry, only a verified marker counts (its caller verifies it)", () => {
    expect(isRecoverySession({}, NOW)).toBe(false);
    expect(isRecoverySession({}, NOW, false)).toBe(false);
    // The action and page get this flag only from hasRecoveryMarker (tests/unit/reset.test.ts
    // shows a bare or foreign cookie is refused through the real action).
    expect(isRecoverySession({}, NOW, true)).toBe(true);
  });
});

describe("requireUser, redirect mode (pages)", () => {
  it("returns the client, user and claims for a full user", async () => {
    const result = await requireUser();
    expect(result.user.id).toBe("user-1");
    expect(result.claims.aal).toBe("aal1");
  });

  it.each([
    ["no user", () => (state.user = null)],
    ["an Auth error", () => (state.userError = new Error("jwt expired"))],
    [
      "an unconfirmed email",
      () => (state.user = emailUser({ email_confirmed_at: null })),
    ],
    ["no claims", () => (state.claims = null)],
  ])("signed out (%s) → /sign-in with next", async (_why, arrange) => {
    arrange();
    expect(await redirectOf(requireUser())).toBe("/sign-in?next=%2Fsettings");
  });

  it("a verified factor on an aal1 session → /auth/mfa", async () => {
    state.user = emailUser({ factors: [{ status: "verified" }] });
    expect(await redirectOf(requireUser())).toBe("/auth/mfa?next=%2Fsettings");
  });

  it("an unverified factor doesn't count; aal2 passes", async () => {
    state.user = emailUser({ factors: [{ status: "unverified" }] });
    await expect(requireUser()).resolves.toBeTruthy();
    state.user = emailUser({ factors: [{ status: "verified" }] });
    state.claims = { aal: "aal2", amr: [] };
    await expect(requireUser()).resolves.toBeTruthy();
  });

  it("allowPendingMfa lets the aal1 user through (the /auth/mfa page itself)", async () => {
    state.user = emailUser({ factors: [{ status: "verified" }] });
    await expect(requireUser({ allowPendingMfa: true })).resolves.toBeTruthy();
  });

  it("an email-only account without a password → /auth/set-password (D10)", async () => {
    state.profile = { password_set_at: null };
    expect(await redirectOf(requireUser())).toBe(
      "/auth/set-password?next=%2Fsettings",
    );
    await expect(
      requireUser({ allowPendingPassword: true }),
    ).resolves.toBeTruthy();
  });

  it("a Google identity skips the password step", async () => {
    state.user = emailUser({
      identities: [{ provider: "email" }, { provider: "google" }],
    });
    state.profile = { password_set_at: null };
    await expect(requireUser()).resolves.toBeTruthy();
  });

  it("a profile read error fails closed (an error, not a way past the step)", async () => {
    state.profileError = { code: "PGRST000" };
    await expect(requireUser()).rejects.toThrow(
      /could not check the password step/,
    );
    state.profileError = null;
    state.profile = null;
    await expect(requireUser()).rejects.toThrow(
      /could not check the password step/,
    );
  });

  it("a hostile x-pathname never becomes an open redirect", async () => {
    state.user = null;
    state.pathname = "//evil.example/x";
    expect(await redirectOf(requireUser())).toBe("/sign-in?next=%2Fdashboard");
  });
});

describe("requireRecentSignIn (D9)", () => {
  it("a stale session → /auth/reauthenticate", async () => {
    vi.useFakeTimers({ now: NOW });
    state.claims = {
      aal: "aal1",
      amr: [{ method: "password", timestamp: secondsAgo(11 * 60) }],
    };
    expect(await redirectOf(requireRecentSignIn())).toBe(
      "/auth/reauthenticate?next=%2Fsettings",
    );
    state.claims = {
      aal: "aal1",
      amr: [{ method: "password", timestamp: secondsAgo(60) }],
    };
    await expect(requireRecentSignIn()).resolves.toBeTruthy();
    vi.useRealTimers();
  });
});

describe("refuse mode (actions) and runAction", () => {
  it("a failed guard throws GuardError inside withRefusals", async () => {
    state.user = null;
    await expect(withRefusals(() => requireUser())).rejects.toBeInstanceOf(
      GuardError,
    );
  });

  it.each([
    ["signed_out", () => (state.user = null), "API-1"],
    [
      "mfa_required",
      () => (state.user = emailUser({ factors: [{ status: "verified" }] })),
      "API-2",
    ],
    [
      "password_required",
      () => (state.profile = { password_set_at: null }),
      "API-3",
    ],
  ])("%s → { ok: false, error: %s }", async (_code, arrange, id) => {
    arrange();
    const result = await runAction("test", async () => {
      await requireUser();
      return { ok: true };
    });
    expect(result).toEqual({ ok: false, error: id });
  });

  it("reauth_required → the constant /auth/reauthenticate?next=/settings", async () => {
    vi.useFakeTimers({ now: NOW });
    state.claims = {
      aal: "aal1",
      amr: [{ method: "password", timestamp: secondsAgo(3600) }],
    };
    state.pathname = "/elsewhere";
    const outcome = await redirectOf(
      runAction("test", async () => {
        await requireRecentSignIn();
        return { ok: true };
      }),
    );
    expect(outcome).toBe("/auth/reauthenticate?next=/settings");
    vi.useRealTimers();
  });

  it("lets the action's own redirect through", async () => {
    const outcome = await redirectOf(
      runAction("test", async () => {
        const { redirect } = await import("next/navigation");
        return redirect("/dashboard");
      }),
    );
    expect(outcome).toBe("/dashboard");
  });

  it("anything else → M-7, logged", async () => {
    const { logError } = await import("@/server/errors");
    const result = await runAction("test.op", async () => {
      throw new Error("db down");
    });
    expect(result).toEqual({ ok: false, error: "M-7" });
    expect(vi.mocked(logError)).toHaveBeenCalledWith(expect.any(Error), {
      op: "test.op",
    });
  });
});
