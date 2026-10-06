import { createElement } from "react";
import { render } from "react-email";
import { describe, expect, it } from "vitest";
import { appConfig } from "@/config/app";
import { escapeHtml } from "./escape-html";
import MagicLink from "@/emails/magic-link";
import ResetPassword from "@/emails/reset-password";
import VerifyEmail from "@/emails/verify-email";
import Welcome from "@/emails/welcome";

// BUILD F-5 "Tests" (FR-28): each template carries the app name, logo, brand colour and support
// email, with SPEC §3.4's copy; auth templates keep GoTrue's placeholders and their own `type`.
const auth = [
  ["E-1 verify", VerifyEmail, "signup", "Confirm your email", "Confirm email"],
  [
    "E-2 magic link",
    MagicLink,
    "magiclink",
    `Sign in to ${appConfig.name}`,
    "Sign in",
  ],
  [
    "E-3 reset",
    ResetPassword,
    "recovery",
    "Reset your password",
    "Reset password",
  ],
] as const;

describe.each(auth)("%s", (_id, Template, type, heading, button) => {
  it("has the confirm link with GoTrue's placeholders and its type", async () => {
    const html = await render(createElement(Template));
    expect(html).toContain(
      `href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&amp;type=${type}"`,
    );
  });

  it("has the brand: logo, name, colour, support email", async () => {
    const html = await render(createElement(Template));
    expect(html).toContain('src="{{ .SiteURL }}/brand/logo.png"');
    expect(html).toContain(escapeHtml(appConfig.name));
    expect(html).toContain(appConfig.brand.primary);
    expect(html).toContain(`mailto:${appConfig.supportEmail}`);
  });

  it("has SPEC §3.4's heading and button", async () => {
    const html = await render(createElement(Template));
    expect(html).toContain(`>${escapeHtml(heading)}</h1>`);
    expect(html).toContain(`>${button}<`);
  });
});

describe("E-4 welcome", () => {
  it("links to the dashboard on the real site, with the support address", async () => {
    const html = await render(
      createElement(Welcome, { siteUrl: "https://app.example" }),
    );
    expect(html).toContain('href="https://app.example/dashboard"');
    expect(html).toContain('src="https://app.example/brand/logo.png"');
    expect(html).toContain(escapeHtml(`Welcome to ${appConfig.name}`));
    expect(html).toContain(
      escapeHtml(`Questions? Reply to ${appConfig.supportEmail}.`),
    );
    expect(html).not.toContain("{{");
  });
});
