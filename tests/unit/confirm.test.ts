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
const { PENDING_COOKIE, WINDOW_MS, signPending, verifyPending } =
  await import("@/server/auth/pending-sign-in");
const { GET, POST } = await import("@/app/auth/confirm/route");

const NOW = Date.parse("2026-11-26T12:00:00Z");
const payload = (over: Partial<Parameters<typeof signPending>[0]> = {}) => ({
  accessToken: "access.jwt.token",
  refreshToken: "refresh-token",
  type: "magiclink" as const,
  email: "mia@example.com",
  issuedAt: NOW,
  ...over,
});

const get = (query: string) =>
  GET(new NextRequest(`https://app.example/auth/confirm?${query}`));
const post = (choice: string) => {
  const body = new FormData();
  body.set("choice", choice);
  return POST(
    new NextRequest("https://app.example/auth/confirm", {
      method: "POST",
      body,
    }),
  );
};
const location = (response: Response) =>
  new URL(response.headers.get("location") ?? "").pathname +
  new URL(response.headers.get("location") ?? "").search;

beforeEach(() => {
  vi.clearAllMocks();
  cookieJar.clear();
  rateLimit.mockResolvedValue({ ok: true });
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
  it("round-trips within the window", () => {
    const value = signPending(payload());
    expect(verifyPending(value, NOW + WINDOW_MS)).toEqual(payload());
  });

  it.each([
    ["expired", (v: string) => v, NOW + WINDOW_MS + 1],
    ["from the future", (v: string) => v, NOW - 1],
    ["missing", () => "", NOW],
    ["unsigned", (v: string) => v.split(".")[0], NOW],
    [
      "with another payload under the old signature",
      (v: string) =>
        `${Buffer.from(JSON.stringify(payload({ email: "eve@example.com" }))).toString("base64url")}.${v.split(".")[1]}`,
      NOW,
    ],
    [
      "with a changed signature",
      (v: string) => `${v.slice(0, -1)}${v.endsWith("A") ? "B" : "A"}`,
      NOW,
    ],
  ])("refuses a value that is %s", (_name, change, now) => {
    const value = change(signPending(payload()));
    expect(verifyPending(value, now)).toBeNull();
  });
});

describe("GET /auth/confirm", () => {
  it("holds a verified link's session and asks 'Is this you?', signing nothing in", async () => {
    detached.verifyOtp.mockResolvedValue({
      data: {
        user: { id: "u1", email: "mia@example.com" },
        session: { access_token: "acc", refresh_token: "ref" },
      },
      error: null,
    });

    const response = await get("token_hash=abc&type=signup");

    expect(response.status).toBe(303);
    expect(location(response)).toBe("/auth/is-this-you");
    expect(detached.verifyOtp).toHaveBeenCalledWith({
      token_hash: "abc",
      type: "signup",
    });
    expect(signedIn.setSession).not.toHaveBeenCalled();
    expect(sendWelcomeIfFirst).not.toHaveBeenCalled();
    const held = verifyPending(cookieJar.get(PENDING_COOKIE), Date.now());
    expect(held).toMatchObject({
      accessToken: "acc",
      refreshToken: "ref",
      type: "signup",
      email: "mia@example.com",
    });
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
  const hold = (over: Partial<Parameters<typeof signPending>[0]> = {}) =>
    cookieJar.set(
      PENDING_COOKIE,
      signPending(payload({ issuedAt: Date.now(), ...over })),
    );

  it("'yes' moves the held session into the sign-in cookies and goes on", async () => {
    hold();
    cookieJar.set("auth_next", "/plan");
    signedIn.setSession.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });

    const response = await post("yes");

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
    hold({ type: "recovery" });
    signedIn.setSession.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    signedIn.getClaims.mockResolvedValue({
      data: { claims: { session_id: "s1" } },
    });

    const response = await post("yes");

    expect(setRecoveryMarker).toHaveBeenCalledWith("u1", "s1");
    expect(location(response)).toBe("/reset-password");
  });

  it("'no' signs the held session out on the server and signs nothing in", async () => {
    hold();
    cookieJar.set("auth_next", "/plan");
    detached.admin.signOut.mockResolvedValue({ error: null });

    const response = await post("no");

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

  it.each([
    ["no held session", () => {}],
    [
      "an expired held session",
      () => hold({ issuedAt: Date.now() - WINDOW_MS - 1 }),
    ],
    [
      "a held session that was altered",
      () => cookieJar.set(PENDING_COOKIE, `${signPending(payload())}x`),
    ],
  ])("sends %s to S-8", async (_name, setup) => {
    setup();
    const response = await post("yes");
    expect(location(response)).toBe("/auth/error?reason=link");
    expect(signedIn.setSession).not.toHaveBeenCalled();
  });

  it("refuses an answer that isn't yes or no", async () => {
    hold();
    const response = await post("maybe");
    expect(location(response)).toBe("/auth/error?reason=link");
    expect(signedIn.setSession).not.toHaveBeenCalled();
  });

  it("sends a 'yes' Supabase refuses to S-8", async () => {
    hold();
    signedIn.setSession.mockResolvedValue({
      data: { user: null },
      error: { message: "invalid" },
    });
    const response = await post("yes");
    expect(location(response)).toBe("/auth/error?reason=link");
    expect(sendWelcomeIfFirst).not.toHaveBeenCalled();
  });

  it("has its own rate limit key", async () => {
    rateLimit.mockResolvedValue({ ok: false });
    hold();
    const response = await post("yes");
    expect(rateLimit).toHaveBeenCalledWith("authConfirmAnswer");
    expect(location(response)).toBe("/auth/error?reason=rate_limited");
    expect(signedIn.setSession).not.toHaveBeenCalled();
  });
});
