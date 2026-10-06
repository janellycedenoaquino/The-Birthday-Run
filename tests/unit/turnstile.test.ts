import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// BUILD F-2 "Turnstile" (NFR-11, D4, rule 14): verifyTurnstile for future non-auth forms. Fails
// closed on every error. Siteverify is the network boundary, so it's the one thing faked.
vi.mock("@/server/errors", () => ({ logError: vi.fn() }));
const { verifyTurnstile } = await import("@/server/security/turnstile");
const { logError } = await import("@/server/errors");

const reply = (body: unknown) =>
  vi.fn<typeof fetch>(async () => Response.json(body));

beforeEach(() => vi.stubEnv("TURNSTILE_SECRET_KEY", "test-turnstile-secret"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(logError).mockClear();
});

describe("verifyTurnstile", () => {
  it("passes a valid token, sending secret, token and IP to siteverify", async () => {
    const fetchFn = reply({ success: true, action: "contact" });
    expect(
      await verifyTurnstile("tok", {
        remoteIp: "203.0.113.7",
        expectedAction: "contact",
        fetchFn,
      }),
    ).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    );
    expect(Object.fromEntries(init?.body as URLSearchParams)).toEqual({
      secret: "test-turnstile-secret",
      response: "tok",
      remoteip: "203.0.113.7",
    });
  });

  it("doesn't send the 'unknown' placeholder as an IP", async () => {
    const fetchFn = reply({ success: true });
    await verifyTurnstile("tok", { remoteIp: "unknown", fetchFn });
    expect(
      (fetchFn.mock.calls[0][1]?.body as URLSearchParams).has("remoteip"),
    ).toBe(false);
  });

  it.each([
    ["Cloudflare says no", { success: false }],
    ["the action doesn't match", { success: true, action: "other" }],
    ["the reply isn't the expected shape", { ok: 1 }],
  ])("fails when %s", async (_why, body) => {
    expect(
      await verifyTurnstile("tok", {
        expectedAction: "contact",
        fetchFn: reply(body),
      }),
    ).toBe(false);
  });

  it("fails closed when siteverify can't be reached", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await verifyTurnstile("tok", { fetchFn })).toBe(false);
    expect(logError).toHaveBeenCalled();
  });

  it("fails on an empty token without calling Cloudflare", async () => {
    const fetchFn = reply({ success: true });
    expect(await verifyTurnstile("", { fetchFn })).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("fails with a clear log line when the secret isn't set", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const fetchFn = reply({ success: true });
    expect(await verifyTurnstile("tok", { fetchFn })).toBe(false);
    expect(String(vi.mocked(logError).mock.calls[0][0])).toMatch(
      /TURNSTILE_SECRET_KEY is not set; add it to serverEnvSchema/,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("verifyTurnstile, stricter (#11 review)", () => {
  it("refuses a token over 2048 characters without calling Cloudflare", async () => {
    const fetchFn = reply({ success: true });
    expect(await verifyTurnstile("x".repeat(2049), { fetchFn })).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a non-2xx reply even if its body says success", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () =>
      Response.json({ success: true }, { status: 500 }),
    );
    expect(await verifyTurnstile("tok", { fetchFn })).toBe(false);
  });

  it("checks the hostname when given", async () => {
    const fetchFn = reply({ success: true, hostname: "other.example" });
    expect(
      await verifyTurnstile("tok", {
        expectedHostname: "app.example",
        fetchFn,
      }),
    ).toBe(false);
    expect(
      await verifyTurnstile("tok", {
        expectedHostname: "other.example",
        fetchFn: reply({ success: true, hostname: "other.example" }),
      }),
    ).toBe(true);
  });
});
