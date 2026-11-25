import { beforeEach, describe, expect, it, vi } from "vitest";

// BUILD F-12 "Tests": the cron route (401 / counts, no-store) and the turn-off POST (one-click
// 200 with no redirect, page form 303, a bad token answered the same way, rate limit). The run,
// the admin client and the limiter are the faked boundaries.
vi.mock("@/server/errors", async (io) =>
  (await import("./mock-helpers")).quietErrors(io),
);
const SECRET = "c".repeat(40);
const UNSUB = "u".repeat(40);
vi.mock("@/server/env", () => ({
  env: { CRON_SECRET: SECRET, REMINDER_UNSUBSCRIBE_SECRET: UNSUB },
}));
const run = vi.fn(async () => ({
  candidates: 2,
  sent: 1,
  failed: 0,
  deferred: 1,
}));
vi.mock("@/server/reminders/run", () => ({ runReminders: run }));
vi.mock("@/server/site-url", () => ({
  getSiteUrl: () => "https://example.test",
}));
vi.mock("@/server/email/send", () => ({ sendEmail: vi.fn() }));
const recordHeartbeat = vi.fn(async () => {});
vi.mock("@/server/heartbeat", () => ({ recordHeartbeat }));
const updates: unknown[] = [];
const updateError = { value: null as { code: string } | null };
vi.mock("@/server/supabase/admin", () => ({
  getAdminClient: () => ({
    from: () => ({
      update: (values: unknown) => ({
        eq: async (_: string, id: string) => {
          if (updateError.value) return { error: updateError.value };
          updates.push({ values, id });
          return { error: null };
        },
      }),
    }),
  }),
}));
const limited = { value: false };
vi.mock("@/server/security/rate-limit", () => ({
  rateLimit: async () =>
    limited.value ? { ok: false, error: "M-5" } : { ok: true },
}));

const cron = await import("@/app/api/cron/reminders/route");
const unsub = await import("@/app/api/reminders/unsubscribe/route");
const { createUnsubscribeToken } =
  await import("@/server/reminders/unsubscribe-token");

const USER = "00000000-0000-4000-8000-000000000042";
const post = (token: string, body: Record<string, string>) =>
  unsub.POST(
    new Request(
      `https://example.test/api/reminders/unsubscribe?token=${encodeURIComponent(token)}`,
      {
        method: "POST",
        body: new URLSearchParams(body),
      },
    ),
  );

beforeEach(() => {
  updates.length = 0;
  limited.value = false;
  updateError.value = null;
  run.mockClear();
  recordHeartbeat.mockClear();
});

describe("GET /api/cron/reminders (D14)", () => {
  it("no or wrong bearer → 401, nothing run", async () => {
    for (const auth of [undefined, "Bearer nope"]) {
      const res = await cron.GET(
        new Request("https://example.test/api/cron/reminders", {
          headers: auth ? { authorization: auth } : {},
        }),
      );
      expect(res.status).toBe(401);
    }
    expect(run).not.toHaveBeenCalled();
  });
  it("the right bearer → the counts, private no-store", async () => {
    const res = await cron.GET(
      new Request("https://example.test/api/cron/reminders", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await res.json()).toEqual({
      candidates: 2,
      sent: 1,
      failed: 0,
      deferred: 1,
    });
    // D16: the heartbeat is recorded once, for this run.
    expect(recordHeartbeat).toHaveBeenCalledOnce();
    expect(recordHeartbeat).toHaveBeenCalledWith(
      expect.anything(),
      "reminders",
      expect.any(Date),
    );
  });
  it("a failing heartbeat write is logged; the run's counts still go back", async () => {
    recordHeartbeat.mockRejectedValueOnce(new Error("heartbeat down"));
    const res = await cron.GET(
      new Request("https://example.test/api/cron/reminders", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).sent).toBe(1);
  });
  it("a failing run → 500 with zero counts, no details", async () => {
    run.mockRejectedValueOnce(new Error("db down"));
    const res = await cron.GET(
      new Request("https://example.test/api/cron/reminders", {
        headers: { authorization: `Bearer ${SECRET}` },
      }),
    );
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("db down");
    expect(recordHeartbeat).not.toHaveBeenCalled();
  });
});

describe("POST /api/reminders/unsubscribe (FR-42, RFC 8058)", () => {
  const good = () => createUnsubscribeToken(USER)!;

  it("one-click: 200 text, no redirect; reminders turned off", async () => {
    const res = await post(good(), { "List-Unsubscribe": "One-Click" });
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    expect(updates).toEqual([
      { values: { reminders_enabled: false }, id: USER },
    ]);
  });

  it("the page's form: 303 to the done page", async () => {
    const res = await post(good(), { source: "page" });
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/reminders/unsubscribe?done=1");
    expect(updates).toHaveLength(1);
  });

  it("a bad token gets the same answers and changes nothing (no oracle)", async () => {
    const page = await post("v1.nope.nope", { source: "page" });
    expect(page.status).toBe(303);
    expect(page.headers.get("location")).toBe("/reminders/unsubscribe?done=1");
    const oneClick = await post("v1.nope.nope", {
      "List-Unsubscribe": "One-Click",
    });
    expect(oneClick.status).toBe(200);
    expect(await oneClick.text()).toBe("Reminders are off.");
    expect(updates).toEqual([]);
  });

  it("an unexpected body changes nothing", async () => {
    await post(good(), { other: "1" });
    expect(updates).toEqual([]);
  });

  it("rate limited: the page gets the error; one-click isn't limited (shared mail IPs)", async () => {
    limited.value = true;
    const page = await post(good(), { source: "page" });
    expect(page.headers.get("location")).toBe(
      "/reminders/unsubscribe?error=rate_limited",
    );
    expect(updates).toEqual([]);
    expect(
      (await post(good(), { "List-Unsubscribe": "One-Click" })).status,
    ).toBe(200);
    expect(updates).toHaveLength(1);
  });

  it("extra fields from a mail client are fine", async () => {
    await post(good(), { "List-Unsubscribe": "One-Click", extra: "1" });
    expect(updates).toHaveLength(1);
  });

  it("a failed update never says off: page → error=failed, one-click → 500", async () => {
    updateError.value = { code: "57014" };
    expect(
      (await post(good(), { source: "page" })).headers.get("location"),
    ).toBe("/reminders/unsubscribe?error=failed");
    expect(
      (await post(good(), { "List-Unsubscribe": "One-Click" })).status,
    ).toBe(500);
  });
});
