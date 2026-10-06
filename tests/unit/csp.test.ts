import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCsp,
  EMPTY_STYLE_HASH,
  newNonce,
  SONNER_STYLE_HASH,
  STYLE_POLICY,
} from "@/server/security/csp";

// BUILD F-2 "Tests": buildCsp for both STYLE_POLICY values; dev adds 'unsafe-eval' only to
// script-src; the Supabase origin is in form-action (NFR-13).

const directives = (csp: string) =>
  new Map(
    csp.split("; ").map((d) => {
      const [name, ...values] = d.split(" ");
      return [name, values.join(" ")] as const;
    }),
  );

const base = { nonce: "abc123", supabaseUrl: "http://127.0.0.1:54321/rest/v1" };

describe("buildCsp", () => {
  it("ships with the split style policy (D5)", () => {
    expect(STYLE_POLICY).toBe("split");
  });

  it("split: nonce'd style elements plus Sonner's exact stylesheet, inline style attributes only", () => {
    const d = directives(
      buildCsp({ ...base, dev: false, stylePolicy: "split" }),
    );
    expect(d.get("style-src-elem")).toBe(
      `'self' 'nonce-abc123' '${SONNER_STYLE_HASH}' '${EMPTY_STYLE_HASH}'`,
    );
    expect(d.get("style-src-attr")).toBe("'unsafe-inline'");
    expect(d.has("style-src")).toBe(false);
  });

  // Week-1 check 1 (decision 0011): Sonner injects its stylesheet as an un-nonced <style>, first
  // empty, then filled. The CSP allows exactly those two contents by hash.
  it("the empty-<style> hash is SHA-256 of the empty string", () => {
    expect(EMPTY_STYLE_HASH).toBe(
      "sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=",
    );
  });

  it.each(["index.mjs", "index.js"])(
    "the Sonner hash matches the stylesheet in the installed sonner/dist/%s",
    (file) => {
      const source = readFileSync(
        resolve(import.meta.dirname, "../../node_modules/sonner/dist", file),
        "utf8",
      );
      const calls = [...source.matchAll(/__insertCSS\(("(?:[^"\\]|\\.)*")\)/g)];
      expect(calls).toHaveLength(1);
      const css: string = JSON.parse(calls[0][1]);
      const hash = createHash("sha256").update(css, "utf8").digest("base64");
      expect(SONNER_STYLE_HASH).toBe(`sha256-${hash}`);
    },
  );

  it("unsafe-inline fallback: one style-src, script rules unchanged", () => {
    const split = directives(
      buildCsp({ ...base, dev: false, stylePolicy: "split" }),
    );
    const inline = directives(
      buildCsp({ ...base, dev: false, stylePolicy: "unsafe-inline" }),
    );
    expect(inline.get("style-src")).toBe("'self' 'unsafe-inline'");
    expect(inline.has("style-src-elem")).toBe(false);
    expect(inline.get("script-src")).toBe(split.get("script-src"));
  });

  it("scripts need the nonce and never allow inline scripts", () => {
    const script = directives(buildCsp({ ...base, dev: false })).get(
      "script-src",
    );
    expect(script).toBe(
      "'self' 'nonce-abc123' 'strict-dynamic' https://challenges.cloudflare.com",
    );
    expect(script).not.toContain("unsafe-inline");
  });

  it("dev adds 'unsafe-eval' to script-src and nowhere else", () => {
    const prod = buildCsp({ ...base, dev: false });
    const dev = buildCsp({ ...base, dev: true });
    expect(directives(dev).get("script-src")).toBe(
      `${directives(prod).get("script-src")} 'unsafe-eval'`,
    );
    expect(dev.match(/unsafe-eval/g)).toHaveLength(1);
  });

  it("form-action allows the Supabase origin (not its path) and Google", () => {
    const d = directives(buildCsp({ ...base, dev: false }));
    expect(d.get("form-action")).toBe(
      "'self' http://127.0.0.1:54321 https://accounts.google.com",
    );
  });

  it("locks down framing, base, objects and mixed content", () => {
    const d = directives(buildCsp({ ...base, dev: false }));
    expect(d.get("default-src")).toBe("'self'");
    expect(d.get("frame-ancestors")).toBe("'none'");
    expect(d.get("base-uri")).toBe("'self'");
    expect(d.get("object-src")).toBe("'none'");
    expect(d.get("frame-src")).toBe("https://challenges.cloudflare.com");
    expect(d.has("upgrade-insecure-requests")).toBe(true);
  });
});

describe("newNonce", () => {
  it("is different every time and base64", () => {
    const nonces = new Set(Array.from({ length: 50 }, newNonce));
    expect(nonces.size).toBe(50);
    for (const n of nonces) expect(n).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });
});
