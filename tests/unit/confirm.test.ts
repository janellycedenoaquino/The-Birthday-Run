import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// "Is this you?" on email links (decision 0026, T-118): the masked email, the signed
// `auth_pending` cookie, and /auth/confirm's GET (verify, hold) and POST (yes, no). Supabase, the
// limiter and Next's cookie store are the faked boundaries.

const signedIn = { setSession: vi.fn(), getClaims: vi.fn() };
const detached = { verifyOtp: vi.fn(), admin: { signOut: vi.fn() } };
const cookieJar = new Map<string, string>();
const sendWelcomeIfFirst = vi.fn();
const setRecoveryMarker = vi.fn();
const rateLimit = vi.fn<(action: string) => Promise<{ ok: boolean }>>(
  async () => ({ ok: true }),
);

vi.mock("@/server/supabase/server", () => ({
  createClient: async () => ({ auth: signedIn }),
  createDetachedClient: () => ({ auth: detached }),
}));
vi.mock("@/server/security/rate-limit", () => ({
  rateLimit: (action: string) => rateLimit(action),
}));
vi.mock("@/server/email/welcome", () => ({
  sendWelcomeIfFirst: (...args: unknown[]) => sendWelcomeIfFirst(...args),
}));
vi.mock("@/server/auth/recovery", () => ({
  setRecoveryMarker: (...args: unknown[]) => setRecoveryMarker(...args),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (arg: string | { name: string }) =>
      cookieJar.delete(typeof arg === "string" ? arg : arg.name),
  }),
}));
vi.mock("@/server/errors", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/errors")>()),
  logError: vi.fn(),
}));

const { maskEmail } = await import("@/lib/security/mask-email");
const {
  PENDING_COOKIE,
  WINDOW_MS,
  MAX_VALUE_LENGTH,
  signPending,
  verifyPending,
} = await import("@/server/auth/pending-sign-in");
const { GET, POST } = await import("@/app/auth/confirm/route");

const NOW = Date.parse("2026-11-26T12:00:00Z");
type Payload = Parameters<typeof signPending>[0];
const payload = (over: Partial<Payload> = {}): Payload => ({
  accessToken: "access.jwt.token",
  refreshToken: "refresh-token",
  type: "magiclink",
  email: "mia@example.com",
  issuedAt: NOW,
  ...over,
});
const idOf = (value: string) => value.split(".")[1];

const get = (query: string) =>
  GET(new NextRequest(`https://app.example/auth/confirm?${query}`));
const post = (
  fields: Record<string, string>,
  headers: Record<string, string> = { "sec-fetch-site": "same-origin" },
) => {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.set(k, v);
  return POST(
    new NextRequest("https://app.example/auth/confirm", {
      method: "POST",
      body,
      headers,
    }),
  );
};
const location = (response: Response) => {
  const url = new URL(response.headers.get("location") ?? "");
  return url.pathname + url.search;
};
const verified = (email = "mia@example.com", token = "acc") =>
  detached.verifyOtp.mockResolvedValue({
    data: {
      user: { id: "u1", email },
      session: { access_token: token, refresh_token: "ref" },
    },
    error: null,
  });

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  rateLimit.mockResolvedValue({ ok: true });
  detached.admin.signOut.mockResolvedValue({ error: null });
});

describe("maskEmail", () => {
  it("keeps the first character and the domain", () => {
    expect(maskEmail("mia@example.com")).toBe("m•••@example.com");
    expect(maskEmail("a@b.co")).toBe("a•••@b.co");
  });
  it("hides everything when the address is malformed", () => {
    expect(maskEmail("no-at-sign")).toBe("•••");
    expect(maskEmail("@example.com")).toBe("•••");
    expect(maskEmail("mia@")).toBe("•••");
  });
  it("masks by character, not by byte", () => {
    expect(maskEmail("élodie@example.com")).toBe("é•••@example.com");
  });
});

describe("the signed auth_pending cookie", () => {
  it("round-trips, fresh within the window, with its signature as the ID", () => {
    const value = signPending(payload());
    expect(verifyPending(value, NOW + WINDOW_MS)).toEqual({
      payload: payload(),
      id: idOf(value),
      fresh: true,
    });
  });

  it.each([
    ["after the window", NOW + WINDOW_MS + 1],
    ["before it was issued", NOW - 1],
  ])("is authentic but not fresh %s", (_name, now) => {
    expect(verifyPending(signPending(payload()), now)?.fresh).toBe(false);
  });

  it.each([
    ["missing", () => ""],
    ["unsigned", (v: string) => v.split(".")[0]],
    [
      "another payload under the old signature",
      (v: string) =>
        `${Buffer.from(JSON.stringify(payload({ email: "eve@example.com" }))).toString("base64url")}.${idOf(v)}`,
    ],
    [
      "a changed signature",
      (v: string) => `${v.slice(0, -1)}${v.endsWith("A") ? "B" : "A"}`,
    ],
    ["longer than a cookie can hold", () => "a".repeat(MAX_VALUE_LENGTH + 1)],
  ])("refuses %s", (_name, change) => {
    expect(verifyPending(change(signPending(payload())), NOW)).toBeNull();
  });
});

describe("GET /auth/confirm", () => {
  it("holds a verified link's session and asks 'Is this you?', signing nothing in", async () => {
    verified();

    const response = await get("token_hash=abc&type=signup");

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/auth/is-this-you");
    expect(detached.verifyOtp).toHaveBeenCalledWith({
      token_hash: "abc",
      type: "signup",
    });
    expect(signedIn.setSession).not.toHaveBeenCalled();
    expect(sendWelcomeIfFirst).not.toHaveBeenCalled();
    expect(
      verifyPending(cookieJar.get(PENDING_COOKIE), Date.now())?.payload,
    ).toMatchObject({
      accessToken: "acc",
      refreshToken: "ref",
      type: "signup",
      email: "mia@example.com",
    });
  });

  it("ends a sign-in an earlier link left unanswered before holding the new one", async () => {
    cookieJar.set(
      PENDING_COOKIE,
      signPending(payload({ accessToken: "old", issuedAt: Date.now() })),
    );
    verified("eve@example.com", "new");

    await get("token_hash=abc&type=magiclink");

    expect(detached.admin.signOut).toHaveBeenCalledWith("old", "local");
    expect(
      verifyPending(cookieJar.get(PENDING_COOKIE), Date.now())?.payload
        .accessToken,
    ).toBe("new");
  });

  it("refuses, visibly, a session too big for a cookie, and ends it", async () => {
    verified("mia@example.com", "x".repeat(MAX_VALUE_LENGTH));
    const response = await get("token_hash=abc&type=magiclink");
    expect(location(response)).toBe("/auth/error?reason=link");
    expect(cookieJar.has(PENDING_COOKIE)).toBe(false);
    expect(detached.admin.signOut).toHaveBeenCalledWith(
      "x".repeat(MAX_VALUE_LENGTH),
      "local",
    );
  });

  it("sends a used or expired link to S-8 and holds nothing", async () => {
    detached.verifyOtp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: "otp_expired" },
    });
    const response = await get("token_hash=abc&type=magiclink");
    expect(location(response)).toBe("/auth/error?reason=link");
    expect(cookieJar.has(PENDING_COOKIE)).toBe(false);
  });

  it("refuses a link type our emails never send, without calling Supabase", async () => {
    const response = await get("token_hash=abc&type=email_change");
    expect(location(response)).toBe("/auth/error?reason=link");
    expect(detached.verifyOtp).not.toHaveBeenCalled();
  });

  it("is rate limited before anything else", async () => {
    rateLimit.mockResolvedValue({ ok: false });
    const response = await get("token_hash=abc&type=signup");
    expect(location(response)).toBe("/auth/error?reason=rate_limited");
    expect(rateLimit).toHaveBeenCalledWith("authConfirm");
    expect(detached.verifyOtp).not.toHaveBeenCalled();
  });
});

describe("POST /auth/confirm", () => {
  /** Holds a sign-in and returns the ID the page would put in its form. */
  const hold = (over: Partial<Payload> = {}) => {
    const value = signPending(payload({ issuedAt: Date.now(), ...over }));
    cookieJar.set(PENDING_COOKIE, value);
    return idOf(value);
  };
  const accepted = () =>
    signedIn.setSession.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

  it("'yes' moves the held session into the sign-in cookies and goes on", async () => {
    const held = hold();
    cookieJar.set("auth_next", "/plan");
    accepted();

    const response = await post({ choice: "yes", held });

    expect(signedIn.setSession).toHaveBeenCalledWith({
      access_token: "access.jwt.token",
      refresh_token: "refresh-token",
    });
    expect(sendWelcomeIfFirst).toHaveBeenCalledOnce();
    expect(location(response)).toBe("/plan");
    expect(cookieJar.has(PENDING_COOKIE)).toBe(false);
    expect(cookieJar.has("auth_next")).toBe(false);
  });

  it("'yes' on a reset link marks the session and goes to S-7", async () => {
    const held = hold({ type: "recovery" });
    accepted();
    signedIn.getClaims.mockResolvedValue({
      data: { claims: { session_id: "s1" } },
    });

    const response = await post({ choice: "yes", held });

    expect(setRecoveryMarker).toHaveBeenCalledWith("u1", "s1");
    expect(location(response)).toBe("/reset-password");
  });

  it("'yes' never accepts a sign-in a later link put in place of the one the page showed", async () => {
    // Tab 1 showed the visitor's own sign-in; a second link (another tab) replaced it.
    const shown = hold({ email: "mia@example.com", accessToken: "mine" });
    hold({ email: "eve@example.com", accessToken: "theirs" });
    accepted();

    const response = await post({ choice: "yes", held: shown });

    expect(location(response)).toBe("/auth/error?reason=link");
    expect(signedIn.setSession).not.toHaveBeenCalled();
    expect(detached.admin.signOut).toHaveBeenCalledWith("theirs", "local");
    expect(cookieJar.has(PENDING_COOKIE)).toBe(false);
  });

  it("'no' signs the held session out on the server and signs nothing in", async () => {
    const held = hold();
    cookieJar.set("auth_next", "/plan");

    const response = await post({ choice: "no", held });

    expect(detached.admin.signOut).toHaveBeenCalledWith(
      "access.jwt.token",
      "local",
    );
    expect(signedIn.setSession).not.toHaveBeenCalled();
    expect(sendWelcomeIfFirst).not.toHaveBeenCalled();
    expect(location(response)).toBe("/auth/is-this-you?declined=1");
    expect(cookieJar.has(PENDING_COOKIE)).toBe(false);
    expect(cookieJar.has("auth_next")).toBe(false);
  });

  it("ends an authentic sign-in answered after its window, and sends it to S-8", async () => {
    const held = hold({ issuedAt: Date.now() - WINDOW_MS - 1 });
    const response = await post({ choice: "yes", held });
    expect(location(response)).toBe("/auth/error?reason=link");
    expect(signedIn.setSession).not.toHaveBeenCalled();
    expect(detached.admin.signOut).toHaveBeenCalledWith(
      "access.jwt.token",
      "local",
    );
  });

  it.each([
    ["no held session", () => "A".repeat(43)],
    [
      "an altered held session",
      () => {
        const held = hold();
        cookieJar.set(PENDING_COOKIE, `x${cookieJar.get(PENDING_COOKIE)}`);
        return held;
      },
    ],
  ])("sends %s to S-8", async (_name, setup) => {
    const held = setup();
    const response = await post({ choice: "yes", held });
    expect(location(response)).toBe("/auth/error?reason=link");
    expect(signedIn.setSession).not.toHaveBeenCalled();
  });

  it.each([
    ["an answer that isn't yes or no", { choice: "maybe" }],
    ["no held ID", { choice: "yes", held: "" }],
  ])("refuses %s", async (_name, fields) => {
    const held = hold();
    const response = await post({ held, ...fields });
    expect(location(response)).toBe("/auth/error?reason=link");
    expect(signedIn.setSession).not.toHaveBeenCalled();
  });

  it("ignores another site's POST, leaving the held sign-in alone", async () => {
    const held = hold();
    cookieJar.set("auth_next", "/plan");
    const response = await post(
      { choice: "no", held },
      { "sec-fetch-site": "cross-site" },
    );
    expect(location(response)).toBe("/auth/error?reason=link");
    expect(cookieJar.has(PENDING_COOKIE)).toBe(true);
    expect(cookieJar.has("auth_next")).toBe(true);
    expect(detached.admin.signOut).not.toHaveBeenCalled();
  });

  it("ends the held session when Supabase refuses a 'yes'", async () => {
    const held = hold();
    signedIn.setSession.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid" },
    });
    const response = await post({ choice: "yes", held });
    expect(location(response)).toBe("/auth/error?reason=link");
    expect(sendWelcomeIfFirst).not.toHaveBeenCalled();
    expect(detached.admin.signOut).toHaveBeenCalledOnce();
  });

  it("has its own rate limit key", async () => {
    rateLimit.mockResolvedValue({ ok: false });
    const held = hold();
    const response = await post({ choice: "yes", held });
    expect(rateLimit).toHaveBeenCalledWith("authConfirmAnswer");
    expect(location(response)).toBe("/auth/error?reason=rate_limited");
    expect(signedIn.setSession).not.toHaveBeenCalled();
  });
});
