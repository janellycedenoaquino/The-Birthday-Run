import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BrandStyle } from "@/components/layout/brand-style";

// The root layout's brand <style> (BUILD F-3 "Root layout", D16): nonce'd, and only the brand
// tokens. Selectors are doubled so they win over globals.css whatever order the two load in.
const render = (brand: Parameters<typeof BrandStyle>[0]["brand"]) =>
  renderToStaticMarkup(createElement(BrandStyle, { nonce: "abc123", brand }));

describe("BrandStyle", () => {
  it("sets the light pair on every theme when there's no dark pair", () => {
    expect(render({ primary: "#112233", primaryForeground: "#ffffff" })).toBe(
      '<style nonce="abc123">:root:root{--primary:#112233;--primary-foreground:#ffffff}</style>',
    );
  });

  it("adds the dark pair under .dark", () => {
    expect(
      render({
        primary: "#112233",
        primaryForeground: "#ffffff",
        primaryDark: "#aabbcc",
        primaryForegroundDark: "#000000",
      }),
    ).toBe(
      '<style nonce="abc123">:root:root{--primary:#112233;--primary-foreground:#ffffff}' +
        ":root.dark{--primary:#aabbcc;--primary-foreground:#000000}</style>",
    );
  });

  it("refuses a value that isn't #rrggbb (no CSS injection even if the schema were bypassed)", () => {
    expect(() =>
      render({
        primary: "red}body{display:none",
        primaryForeground: "#ffffff",
      }),
    ).toThrow(/brand colour/);
  });
});
