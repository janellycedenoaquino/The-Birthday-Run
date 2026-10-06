import { unstable_doesMiddlewareMatch as proxyMatches } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it } from "vitest";
import {
  isSecureCookie,
  sessionCookieOptions,
} from "@/lib/supabase/cookie-options";
import { SECURITY_HEADERS } from "@/lib/security/headers";

// BUILD F-2 proxy (FR-9, FR-10, NFR-13, D2). Signed-out requests only: with no session cookie,
// getClaims() answers locally, so no Supabase is needed. Signed-in refresh is covered by e2e.

let proxy: typeof import("@/proxy").proxy;
let config: typeof import("@/proxy").config;
beforeAll(async () => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_unit-test",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
  });
  ({ proxy, config } = await import("@/proxy"));
});

const request = (path: string, headers: Record<string, string> = {}) =>
  new NextRequest(new URL(path, "http://localhost:3000"), { headers });

const nonceOf = (csp: string | null) => csp?.match(/'nonce-([^']+)'/)?.[1];

describe("proxy", () => {
  it("sets a CSP with a fresh nonce on every response", async () => {
    const a = (await proxy(request("/"))).headers.get(
      "content-security-policy",
    );
    const b = (await proxy(request("/"))).headers.get(
      "content-security-policy",
    );
    expect(nonceOf(a)).toBeTruthy();
    expect(nonceOf(a)).not.toBe(nonceOf(b));
    expect(a).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it("overwrites forged x-nonce, x-pathname and CSP request headers", async () => {
    const res = await proxy(
      request("/privacy?x=1", {
        "x-nonce": "forged",
        "x-pathname": "/forged",
        "content-security-policy": "script-src *",
      }),
    );
    const csp = res.headers.get("content-security-policy");
    // NextResponse.next({ request: { headers } }) forwards overrides as x-middleware-request-*.
    expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonceOf(csp));
    expect(res.headers.get("x-middleware-request-x-pathname")).toBe(
      "/privacy?x=1",
    );
    expect(
      res.headers.get("x-middleware-request-content-security-policy"),
    ).toBe(csp);
  });

  it.each([
    "/dashboard",
    "/settings/security",
    "/auth/set-password",
    "/auth/reauthenticate",
    "/auth/mfa",
  ])(
    "redirects a signed-out visitor from %s to sign-in with next",
    async (path) => {
      const res = await proxy(request(`${path}?tab=a%20b`));
      expect(res.status).toBe(302);
      const to = new URL(res.headers.get("location")!);
      expect(to.pathname).toBe("/sign-in");
      expect(to.searchParams.get("next")).toBe(`${path}?tab=a%20b`);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      expect(res.headers.get("content-security-policy")).toContain("'nonce-");
    },
  );

  // /account/export redirects signed-out callers itself, to /settings's sign-in (BUILD F-11).
  it.each([
    "/",
    "/sign-in",
    "/privacy",
    "/dashboards",
    "/auth/confirm",
    "/account/export",
  ])("lets %s through signed out", async (path) => {
    const res = await proxy(request(path));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });
});

// Every page, including a 404, needs the proxy's nonce or the root layout throws (decision 0018).
describe("proxy matcher (F-2)", () => {
  it.each([
    "/",
    "/dashboard",
    "/favicon.ico", // no such file: the 404 page renders
    "/icon", // the icons live under /icon/<size>
    "/iconography",
    "/monitoring-status",
    "/robots.txt.bak",
    // Under an exact-path exclusion: the 404 page renders, so it needs the nonce (0018 review).
    "/monitoring/x",
    "/apple-icon/x",
    "/opengraph-image/x",
    "/robots.txt/x",
    "/_next/image/x",
    // Dots are literal, not wildcards.
    "/robotsXtxt",
    "/sitemap-xml",
    "/manifest-webmanifest",
  ])("runs the proxy on %s", (url) => {
    expect(proxyMatches({ config, url })).toBe(true);
  });

  it.each([
    "/_next/static/chunks/a.js",
    "/_next/image?url=%2Fbrand%2Flogo.png&w=64&q=75",
    "/monitoring?o=1&p=2",
    "/icon/32",
    "/apple-icon",
    "/manifest.webmanifest",
    "/robots.txt",
    "/sitemap.xml",
    "/opengraph-image",
  ])("skips %s", (url) => {
    expect(proxyMatches({ config, url })).toBe(false);
  });

  it("skips router prefetches (the `missing` rule)", () => {
    expect(
      proxyMatches({
        config,
        url: "/dashboard",
        headers: { "next-router-prefetch": "1" },
      }),
    ).toBe(false);
  });
});

describe("session cookie options (§0.7)", () => {
  it("are HttpOnly, SameSite=Lax, path /", () => {
    expect(sessionCookieOptions("https://app.example.com")).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });

  it.each([
    ["https://app.example.com", true],
    ["http://localhost:3000", true],
    ["http://127.0.0.1:3000", true],
    ["http://[::1]:3000", true],
    ["http://192.168.1.20:3000", false],
    [undefined, true],
  ])("Secure for %s: %s", (url, secure) => {
    expect(isSecureCookie(url)).toBe(secure);
  });
});

describe("static security headers", () => {
  const byKey = Object.fromEntries(
    SECURITY_HEADERS.map((h) => [h.key, h.value]),
  );
  it("match BUILD F-2", () => {
    expect(byKey["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()",
    );
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["Cross-Origin-Opener-Policy"]).toBe("same-origin");
  });
});
