import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  databaseUrl,
  LOCAL_DB_URL,
  parseArgs,
} from "../../scripts/grant-premium";

// BUILD F-7 "Tests": C-104 (FR-39), requirePremium → BR-2 (NFR-2, metric 2), and the grant
// script's arguments and target (FR-36). Supabase and the entitlement are the faked boundaries.
vi.mock("server-only", () => ({}));
const premium = { value: false };
vi.mock("@/server/premium/entitlement", () => ({
  getEntitlement: vi.fn(async () => ({ premium: premium.value })),
}));
const profile = {
  birth_month: 6,
  birth_day: 15,
  time_zone: "America/New_York",
  onboarded_at: null,
  display_name: null,
  reminders_enabled: false,
};
const supabase = {
  from: () => ({
    select: () => ({
      eq: () => ({ maybeSingle: async () => ({ data: profile, error: null }) }),
    }),
  }),
};
vi.mock("@/server/auth/guards", async (io) => ({
  ...(await io<typeof import("@/server/auth/guards")>()),
  requireUser: vi.fn(async () => ({ supabase, user: { id: "u1" } })),
}));

const { UpgradePrompt } = await import("@/components/billing/upgrade-prompt");
const { requirePremium } = await import("@/server/auth/app-guards");
const { runAction } = await import("@/server/run-action");

const render = async (props: Parameters<typeof UpgradePrompt>[0]) => {
  const node = await UpgradePrompt(props);
  return node ? renderToStaticMarkup(node) : "";
};

beforeEach(() => {
  premium.value = false;
});

describe("C-104 UpgradePrompt (FR-39)", () => {
  it("free: the feature's title, 'coming soon', and no link or button (FR-38)", async () => {
    const html = await render({
      supabase: supabase as never,
      feature: "M-133",
      limit: 3,
    });
    expect(html).toContain("More than 3 groups is part of Premium");
    expect(html).toContain(
      "Premium is coming soon. Everything else in the app is free.",
    );
    expect(html).not.toMatch(/<a |<button|<form/);
  });

  it("Settings' card (M-138): only the body, the card has the title", async () => {
    const html = await render({
      supabase: supabase as never,
      feature: "M-138",
    });
    expect(html).toContain("Premium is coming soon.");
    expect(html).not.toContain("part of Premium");
    expect(html).not.toMatch(/<h\d|<a |<button|<form/);
  });

  it("premium: renders nothing", async () => {
    premium.value = true;
    expect(
      await render({ supabase: supabase as never, feature: "M-131" }),
    ).toBe("");
  });

  it("compact form is one line, still no controls", async () => {
    const html = await render({
      supabase: supabase as never,
      feature: "M-131",
      compact: true,
    });
    expect(html).toMatch(/^<p/);
    expect(html).not.toMatch(/<a |<button|<form/);
  });
});

describe("requirePremium (NFR-2, metric 2)", () => {
  it("a free user's premium action is refused with BR-2", async () => {
    const r = await runAction("test", async () => {
      await requirePremium();
      return { ok: true as const };
    });
    expect(r).toEqual({ ok: false, error: "BR-2" });
  });

  it("a premium user passes with the onboarded session", async () => {
    premium.value = true;
    const r = await runAction("test", async () => {
      const s = await requirePremium();
      return { ok: true as const, data: s.profile.timeZone };
    });
    expect(r).toEqual({ ok: true, data: "America/New_York" });
  });
});

describe("grant-premium arguments and target (FR-36)", () => {
  it("parses grant/revoke, an email and an optional target", () => {
    expect(parseArgs(["grant", "a@b.test"])).toEqual({
      mode: "grant",
      email: "a@b.test",
      target: "local",
    });
    expect(
      parseArgs(["revoke", "a@b.test", "--target=production"]).target,
    ).toBe("production");
  });

  it.each([
    [[]],
    [["grant"]],
    [["promote", "a@b.test"]],
    [["grant", "a@b.test", "extra"]],
    [["grant", "a@b.test", "--target=staging"]],
    [["grant", "a@b.test", "--force"]],
  ])("refuses %j with exit 2", (argv) => {
    expect(() => parseArgs(argv)).toThrow(
      expect.objectContaining({ exitCode: 2 }),
    );
  });

  it("local ignores SUPABASE_DB_URL; production needs it", () => {
    expect(databaseUrl("local", "postgresql://prod.example/db")).toBe(
      LOCAL_DB_URL,
    );
    expect(databaseUrl("production", "postgresql://prod.example/db")).toBe(
      "postgresql://prod.example/db",
    );
    expect(() => databaseUrl("production", undefined)).toThrow(
      expect.objectContaining({ exitCode: 1 }),
    );
  });
});
