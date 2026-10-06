import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/security/safe-redirect";

// BUILD F-2 "Safe redirect" (NFR-8, rule 11): only same-site paths survive.

describe("safeRedirectPath", () => {
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "%2F%2Fevil.example",
    "%252F%252Fevil.example",
    "/%5Cevil.example",
    "\t/dashboard",
    " /dashboard",
  ])("falls back for off-site %j", (input) => {
    expect(safeRedirectPath(input)).toBe("/dashboard");
  });

  it.each([
    "/settings?tab=1",
    "/dashboard",
    "/",
    "/auth/set-password",
    "/auth/mfa?next=%2Fsettings",
    // A step page (#16 review): an MFA step in between keeps the way back to re-auth.
    "/auth/reauthenticate?next=/settings",
  ])("keeps the same-site path %j unchanged", (input) => {
    expect(safeRedirectPath(input)).toBe(input);
  });

  it.each([
    "/auth/confirm?token_hash=x",
    "/auth/callback",
    "/auth/error",
    "/sign-in",
    "/sign-in?next=/dashboard",
    "/sign-up",
    "/dashboard/../sign-in",
    "/%61uth/confirm",
  ])("falls back for the auth loop %j", (input) => {
    expect(safeRedirectPath(input)).toBe("/dashboard");
  });

  it("falls back for non-strings, over-long values and broken encodings", () => {
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath(["/settings"])).toBe("/dashboard");
    expect(safeRedirectPath(`/${"a".repeat(2048)}`)).toBe("/dashboard");
    expect(safeRedirectPath("/%E0%A4%A")).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeRedirectPath("//evil.example", "/settings")).toBe("/settings");
  });
});

describe("safeRedirectPath: still encoded after every round (#12 review)", () => {
  it("falls back instead of passing a value a later step might decode again", () => {
    expect(safeRedirectPath("/%2525252F/evil.com", "/home")).toBe("/home");
  });

  it("still accepts an ordinary encoded path", () => {
    expect(safeRedirectPath("/settings%23profile", "/home")).toBe(
      "/settings%23profile",
    );
  });
});
