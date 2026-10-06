import { describe, expect, it, vi } from "vitest";

// getSiteUrl (BUILD F-3 "Site URL", D24.23).
const env = { NEXT_PUBLIC_SITE_URL: undefined as string | undefined };
vi.mock("@/server/env", () => ({ env }));
const { getSiteUrl } = await import("@/server/site-url");

describe("getSiteUrl", () => {
  it("uses NEXT_PUBLIC_SITE_URL when set", () => {
    env.NEXT_PUBLIC_SITE_URL = "https://app.example";
    expect(getSiteUrl({ env: "preview", branchUrl: "x.vercel.app" })).toBe(
      "https://app.example",
    );
    env.NEXT_PUBLIC_SITE_URL = undefined;
  });

  it("falls back to the branch URL on a Vercel Preview, without a trailing slash", () => {
    expect(
      getSiteUrl({ env: "preview", branchUrl: "app-git-x.vercel.app/" }),
    ).toBe("https://app-git-x.vercel.app");
  });

  it("throws otherwise (never guesses)", () => {
    expect(() => getSiteUrl({ env: "production" })).toThrow(
      /NEXT_PUBLIC_SITE_URL/,
    );
    expect(() => getSiteUrl({})).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
