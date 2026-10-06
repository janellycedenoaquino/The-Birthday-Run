import { describe, expect, it } from "vitest";
import { base32Decode, hotp } from "../rls/totp";

// RFC 6238 appendix B (SHA-1 seed "12345678901234567890"), 8 digits.
describe("totp helper (RFC 6238)", () => {
  const key = Buffer.from("12345678901234567890");
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1234567890, "89005924"],
    [20000000000, "65353130"],
  ])("time %i gives %s", (seconds, code) => {
    expect(hotp(key, Math.floor(seconds / 30), 8)).toBe(code);
  });

  it("decodes base32", () => {
    expect(base32Decode("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ").toString()).toBe(
      "12345678901234567890",
    );
  });
});
