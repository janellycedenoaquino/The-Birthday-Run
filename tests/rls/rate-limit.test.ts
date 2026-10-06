import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// rateLimit() end to end against local Supabase (BUILD F-2 "Rate limit", §0.4, D3): the real
// secret-key client and `rate_limit_hit`. Only next/headers is faked (there's no request here),
// with a fresh IP per test so earlier runs' counters don't matter.
const ip = { value: "" };
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": ip.value }),
}));

const { rateLimit } = await import("@/server/security/rate-limit");

describe("rateLimit against the database (NFR-10)", () => {
  it("allows up to the limit, then refuses with M-5 (authConfirm: 30 per IP)", async () => {
    ip.value = `test-${randomUUID()}`;
    for (let i = 0; i < 30; i++)
      expect(await rateLimit("authConfirm")).toEqual({ ok: true });
    expect(await rateLimit("authConfirm")).toEqual({ ok: false, error: "M-5" });
  });

  it("counts per email across IPs (signUp: 3 per email per hour)", async () => {
    const email = `limit-${randomUUID()}@example.com`;
    for (let i = 0; i < 3; i++) {
      ip.value = `test-${randomUUID()}`;
      expect(await rateLimit("signUp", { email })).toEqual({ ok: true });
    }
    ip.value = `test-${randomUUID()}`;
    expect(await rateLimit("signUp", { email: email.toUpperCase() })).toEqual({
      ok: false,
      error: "M-5",
    });
  });

  it("keeps separate actions apart", async () => {
    ip.value = `test-${randomUUID()}`;
    for (let i = 0; i < 30; i++) await rateLimit("authConfirm");
    expect(await rateLimit("authCallback")).toEqual({ ok: true });
  });
});
