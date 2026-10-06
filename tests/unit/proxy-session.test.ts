import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// The proxy's signed-in paths (BUILD F-2, FR-10, D21): @supabase/ssr is the boundary, so it's
// replaced by a fake that behaves like a token refresh, an outage or a missing session.

type SetAll = (
  cookies: { name: string; value: string; options: Record<string, unknown> }[],
  headers: Record<string, string>,
) => void;
const auth = vi.hoisted(() => ({
  getClaims: undefined as unknown as () => Promise<unknown>,
  onCreate: undefined as unknown as (setAll: SetAll) => void,
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { setAll: SetAll } },
  ) => {
    auth.onCreate?.(opts.cookies.setAll);
    return { auth: { getClaims: () => auth.getClaims() } };
  },
}));

let proxy: typeof import("@/proxy").proxy;
beforeAll(async () => {
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_unit-test",
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    NEXT_PUBLIC_SITE_URL: "https://app.example.com",
  });
  ({ proxy } = await import("@/proxy"));
});

beforeEach(() => {
  auth.onCreate = () => {};
  auth.getClaims = async () => ({
    data: { claims: { sub: "u1" } },
    error: null,
  });
});

const request = (path: string) =>
  new NextRequest(new URL(path, "https://app.example.com"), {
    headers: { cookie: "sb-app-auth-token=old-expired" },
  });

describe("proxy with a session", () => {
  it("forwards the refreshed session to the page and sets it with forced flags", async () => {
    let setAll: SetAll = () => {};
    auth.onCreate = (fn) => (setAll = fn);
    auth.getClaims = async () => {
      // What @supabase/ssr does on refresh: write cookies, weakly flagged by default.
      setAll(
        [
          {
            name: "sb-app-auth-token",
            value: "fresh",
            options: { httpOnly: false, sameSite: "none", maxAge: 3600 },
          },
        ],
        { "Cache-Control": "private, no-cache, no-store", Expires: "0" },
      );
      return { data: { claims: { sub: "u1" } }, error: null };
    };
    const res = await proxy(request("/dashboard"));

    expect(res.status).toBe(200);
    // The page (requireUser) must see the new cookie, not the expired one.
    expect(res.headers.get("x-middleware-request-cookie")).toBe(
      "sb-app-auth-token=fresh",
    );
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("sb-app-auth-token=fresh");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//);
    expect(setCookie).toMatch(/Max-Age=3600/);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("lets a signed-in visitor into a protected page without touching cookies", async () => {
    const res = await proxy(request("/settings"));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("lets the request through when Auth is unreachable (returned error)", async () => {
    auth.getClaims = async () => ({
      data: null,
      error: new AuthRetryableFetchError("fetch failed", 0),
    });
    const res = await proxy(request("/dashboard"));
    expect(res.status).toBe(200);
  });

  it("lets the request through when getClaims throws", async () => {
    auth.getClaims = async () => {
      throw new TypeError("network down");
    };
    const res = await proxy(request("/dashboard"));
    expect(res.status).toBe(200);
  });

  it("redirects when the session is definitely gone, keeping the cleared cookie", async () => {
    let setAll: SetAll = () => {};
    auth.onCreate = (fn) => (setAll = fn);
    auth.getClaims = async () => {
      setAll(
        [{ name: "sb-app-auth-token", value: "", options: { maxAge: 0 } }],
        { Expires: "0" },
      );
      return { data: null, error: null };
    };
    const res = await proxy(request("/dashboard"));
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toMatch(
      /sb-app-auth-token=;.*Max-Age=0/i,
    );
    expect(res.headers.get("expires")).toBe("0");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
