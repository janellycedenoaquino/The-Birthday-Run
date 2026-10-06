import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// BUILD F-2 "Rate limit" and §0.4 (NFR-10, D3, D24.13). The database function itself is tested
// in tests/rls/functions.test.ts; here: keys, order, limits and failing closed.

const rpc = vi.fn();
const forwardedFor = { value: null as string | null };
vi.mock("@/server/supabase/admin", () => ({ getAdminClient: () => ({ rpc }) }));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers(
      forwardedFor.value ? { "x-forwarded-for": forwardedFor.value } : {},
    ),
}));
vi.mock("@/server/errors", () => ({ logError: vi.fn() }));
vi.mock("@/server/env", () => ({
  env: { RATE_LIMIT_HMAC_SECRET: "test-secret-that-is-at-least-32-chars" },
}));

const { LIMITS, clientIp, limitChecks, rateLimit, runChecks } =
  await import("@/server/security/rate-limit");
const { logError } = await import("@/server/errors");

const SECRET = "test-secret-that-is-at-least-32-chars";
const hmac = (v: string) =>
  createHmac("sha256", SECRET).update(v).digest("hex");

beforeEach(() => {
  rpc.mockReset();
  forwardedFor.value = null;
  vi.mocked(logError).mockClear();
});

describe("LIMITS (the §0.4 table)", () => {
  it.each([
    ["signIn", { ip: [20, 600], email: [10, 900] }],
    ["signUp", { ip: [5, 3600], email: [3, 3600] }],
    ["verifyMfaSignIn", { ip: [30, 900], user: [5, 300] }],
    ["startMfaEnrollment", { user: [10, 3600] }],
    ["reauthenticateWithPassword", { ip: [20, 600], user: [5, 900] }],
    ["updateDisplayName", { user: [30, 3600] }],
    ["authConfirm", { ip: [30, 600] }],
  ] as const)("%s", (action, expected) => {
    expect(LIMITS[action]).toEqual(expected);
  });

  it("has every §0.4 operation", () => {
    expect(Object.keys(LIMITS).sort()).toEqual(
      [
        "signIn",
        "signUp",
        "requestMagicLink",
        "requestPasswordReset",
        "verifyMfaSignIn",
        "confirmMfaEnrollment",
        "disableMfa",
        "startMfaEnrollment",
        "reauthenticateWithPassword",
        "signInWithGoogle",
        "changePassword",
        "updatePasswordFromReset",
        "setInitialPassword",
        "accountExport",
        "deleteAccount",
        "updateDisplayName",
        "authConfirm",
        "authCallback",
      ].sort(),
    );
  });
});

describe("limitChecks", () => {
  it("builds HMAC'd keys, IP first, email trimmed and lower-cased", () => {
    const checks = limitChecks(
      "signIn",
      { ip: "203.0.113.7", email: "  Someone@Example.COM " },
      SECRET,
    );
    expect(checks).toEqual([
      { key: `signIn:ip:${hmac("203.0.113.7")}`, max: 20, windowSeconds: 600 },
      {
        key: `signIn:email:${hmac("someone@example.com")}`,
        max: 10,
        windowSeconds: 900,
      },
    ]);
    expect(JSON.stringify(checks)).not.toMatch(/someone|203\.0/i);
  });

  it("keys each MFA action separately", () => {
    const [a] = limitChecks(
      "verifyMfaSignIn",
      { ip: "x", userId: "u" },
      SECRET,
    );
    const [b] = limitChecks("disableMfa", { ip: "x", userId: "u" }, SECRET);
    expect(a.key).not.toBe(b.key);
  });

  it("refuses to build keys without the ID the limit needs", () => {
    expect(() => limitChecks("signIn", { ip: "x" }, SECRET)).toThrow(
      /needs an email/,
    );
    expect(() => limitChecks("deleteAccount", { ip: "x" }, SECRET)).toThrow(
      /needs a user ID/,
    );
  });

  it("treats a blank email as missing (no shared bucket for blanks)", () => {
    expect(() =>
      limitChecks("signIn", { ip: "x", email: "   " }, SECRET),
    ).toThrow(/needs an email/);
  });
});

describe("runChecks", () => {
  it("stops at the first refusal (the IP key), so later keys aren't counted", async () => {
    const hit = vi.fn(async () => false);
    const checks = limitChecks("signIn", { ip: "x", email: "a@b.co" }, SECRET);
    expect(await runChecks(checks, hit)).toBe(false);
    expect(hit).toHaveBeenCalledTimes(1);
  });
});

describe("clientIp", () => {
  it.each([
    ["203.0.113.7, 10.0.0.1", "203.0.113.7"],
    [" 203.0.113.7 ", "203.0.113.7"],
    ["", "unknown"],
    [null, "unknown"],
  ])("%j → %s", (header, ip) => expect(clientIp(header)).toBe(ip));
});

describe("rateLimit", () => {
  it("allows when every key is under its limit, using the first forwarded IP", async () => {
    forwardedFor.value = "198.51.100.2, 10.0.0.1";
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await rateLimit("signIn", { email: "a@b.co" })).toEqual({
      ok: true,
    });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0]).toEqual([
      "rate_limit_hit",
      {
        p_key: `signIn:ip:${hmac("198.51.100.2")}`,
        p_max: 20,
        p_window_seconds: 600,
      },
    ]);
  });

  it("limited → M-5", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await rateLimit("signUp", { email: "a@b.co" })).toEqual({
      ok: false,
      error: "M-5",
    });
  });

  it("anything but true counts as limited", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await rateLimit("authConfirm")).toEqual({ ok: false, error: "M-5" });
  });

  it("a database error fails closed with M-7 and logs no key", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST301", message: "boom" },
    });
    expect(await rateLimit("signIn", { email: "secret@example.com" })).toEqual({
      ok: false,
      error: "M-7",
    });
    const [error, opts] = vi.mocked(logError).mock.calls[0];
    expect(String(error)).not.toMatch(/signIn:|secret@example/);
    expect(opts).toMatchObject({ op: "rateLimit.signIn" });
  });

  it("a missing ID fails closed with M-7 without calling the database", async () => {
    expect(await rateLimit("deleteAccount")).toEqual({
      ok: false,
      error: "M-7",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
