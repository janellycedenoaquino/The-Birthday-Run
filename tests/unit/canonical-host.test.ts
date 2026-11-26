import { describe, expect, it } from "vitest";
import { canonicalHostRedirect } from "@/lib/security/canonical-host";

// Decision 0025: old *.vercel.app links move to the site's own host.
const SITE = "https://www.thebirthdayrun.com";
const OLD = "https://the-birthday-run-roan.vercel.app";
const move = (path: string, method = "GET", site = SITE, host = OLD) =>
  canonicalHostRedirect(new URL(path, host), method, site)?.href ?? null;

describe("canonicalHostRedirect", () => {
  it("moves a page on the old address to the same path and query on the site", () => {
    expect(move("/auth/confirm?token_hash=abc&type=email")).toBe(
      "https://www.thebirthdayrun.com/auth/confirm?token_hash=abc&type=email",
    );
    expect(move("/")).toBe("https://www.thebirthdayrun.com/");
    expect(move("/rewards", "HEAD")).toBe(
      "https://www.thebirthdayrun.com/rewards",
    );
  });

  it("never leaves the site's host, even for a //other.host path", () => {
    const url = new URL(`${OLD}//evil.example/x?y=1`);
    expect(url.host).toBe("the-birthday-run-roan.vercel.app");
    expect(canonicalHostRedirect(url, "GET", SITE)?.href).toBe(
      "https://www.thebirthdayrun.com//evil.example/x?y=1",
    );
  });

  it("leaves /api, posts and the site's own host alone", () => {
    expect(move("/api/cron/reminders")).toBeNull();
    expect(move("/api/reminders/unsubscribe?token=t", "POST")).toBeNull();
    expect(move("/api")).toBeNull();
    expect(move("/reminders/unsubscribe?token=t", "POST")).toBeNull();
    expect(move("/apiary")).toBe("https://www.thebirthdayrun.com/apiary");
    expect(move("/", "GET", SITE, SITE)).toBeNull();
  });

  it("moves only *.vercel.app hosts, so a bare-domain site URL can't loop", () => {
    expect(move("/", "GET", "https://thebirthdayrun.com", SITE)).toBeNull();
    expect(move("/", "GET", SITE, "http://localhost:3000")).toBeNull();
    expect(move("/", "GET", OLD, OLD)).toBeNull();
    expect(
      canonicalHostRedirect(new URL("/", OLD), "GET", undefined),
    ).toBeNull();
  });
});
