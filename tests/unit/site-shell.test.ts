import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { appConfig } from "@/config/app";
import { escapeHtml as escaped } from "./escape-html";

// C-1 and C-2 (SPEC §3.2, BUILD F-3 "Shell components"), rendered to HTML. The open account menu
// is a Radix portal, so its items are covered by the e2e suite (#22), not here.

// The header reads the path with usePathname() (the router's, a framework boundary), so it stays
// right after client-side navigation.
const currentPath = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => currentPath.value }));

const signOut = async () => {};
const header = (
  pathname: string,
  account: { email: string; displayName: string | null } | null = null,
) => {
  currentPath.value = pathname;
  return renderToStaticMarkup(
    createElement(SiteHeader, {
      account: account && { ...account, signOut },
    }),
  );
};

const links = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/g)].map(
    ([, href, inner]) => [href, inner.replace(/<[^>]+>/g, "")],
  );

// The app's own config, not the Template's placeholders, so the suite passes after a rebrand.
const NAME = escaped(appConfig.name);
const SUPPORT = `mailto:${appConfig.supportEmail}`;

describe("C-1 site header, signed out", () => {
  it("links the logo and name home, with Sign in and Sign up", () => {
    const html = header("/");
    expect(html).toContain(`alt="${escaped(appConfig.logo.alt)}"`);
    expect(html).toMatch(/src="\/brand\/logo.svg"/);
    expect(links(html)).toEqual([
      ["/", NAME],
      ["/sign-in", "Sign in"],
      ["/sign-up", "Sign up"],
    ]);
  });

  it("hides its own button on S-4 and S-5", () => {
    expect(links(header("/sign-in"))).toEqual([
      ["/", NAME],
      ["/sign-up", "Sign up"],
    ]);
    expect(links(header("/sign-up"))).toEqual([
      ["/", NAME],
      ["/sign-in", "Sign in"],
    ]);
  });

  it("shows only the logo and name on the step pages S-9, S-10, S-11", () => {
    for (const path of [
      "/auth/set-password",
      "/auth/mfa",
      "/auth/reauthenticate",
    ]) {
      const html = header(path, { email: "a@example.com", displayName: null });
      // Signed in, so the logo goes to the dashboard (SPEC §3.2); the guards own the step itself.
      expect(links(html)).toEqual([["/dashboard", NAME]]);
      expect(html).not.toContain("a@example.com");
      expect(html).not.toContain("<button");
    }
  });
});

describe("C-1 site header, signed in", () => {
  it("links home to the dashboard and always shows the email (D24.9)", () => {
    const html = header("/settings", {
      email: "someone@example.com",
      displayName: "Sam",
    });
    expect(links(html)).toEqual([["/dashboard", NAME]]);
    expect(html).toMatch(/<button[^>]*>.*someone@example\.com.*<\/button>/);
    expect(html).not.toContain(">Sign in<");
  });

  it("renders the email as text, never HTML", () => {
    const html = header("/", {
      email: '"<img src=x>"@example.com',
      displayName: null,
    });
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
  });
});

describe("C-2 site footer", () => {
  afterEach(() => vi.useRealTimers());

  it("has the year, legal entity, Privacy, Terms and the support mailto (FR-17)", () => {
    vi.useFakeTimers({ now: new Date("2031-05-01T12:00:00Z") });
    const html = renderToStaticMarkup(createElement(SiteFooter));
    expect(html).toContain(`© 2031 ${escaped(appConfig.legal.entityName)}`);
    expect(links(html)).toEqual([
      ["/privacy", "Privacy"],
      ["/terms", "Terms"],
      [SUPPORT, "Contact support"],
    ]);
  });

  it("offers the theme select, System by default (FR-21)", () => {
    const html = renderToStaticMarkup(createElement(SiteFooter));
    expect(html).toMatch(/<label[^>]*>.*Theme.*<select/);
    expect(html).toMatch(/<option value="system" selected="">System<\/option>/);
    expect(html).toContain('<option value="light">Light</option>');
    expect(html).toContain('<option value="dark">Dark</option>');
  });
});

describe("SupportLinkText (M-39)", () => {
  it("links only the 'contact support' phrase to the support mailto", async () => {
    const { SupportLinkText } =
      await import("@/components/layout/support-link-text");
    const html = renderToStaticMarkup(
      createElement(SupportLinkText, {
        text: "Please try again. If it keeps happening, contact support.",
      }),
    );
    expect(links(html)).toEqual([[SUPPORT, "contact support"]]);
    expect(html.replace(/<[^>]+>/g, "")).toBe(
      "Please try again. If it keeps happening, contact support.",
    );
  });
});
