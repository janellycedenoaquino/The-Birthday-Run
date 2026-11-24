import { beforeEach, describe, expect, it, vi } from "vitest";

// BUILD F-12 "Tests": runReminders with a mock send and a faked admin client (fixed `now`):
// budget, claims, a failed send releasing its claim, headers. The real claims and their unique
// keys are tested on local Supabase (tests/rls/reminders.test.ts).
vi.mock("@/server/errors", async (io) =>
  (await import("./mock-helpers")).quietErrors(io),
);

const { runReminders, REMINDER_RUN_BUDGET } =
  await import("@/server/reminders/run");
const { createUnsubscribeToken, verifyUnsubscribeToken } =
  await import("@/server/reminders/unsubscribe-token");
const { checkCronAuth } = await import("@/server/security/cron-auth");

const SECRET = "x".repeat(40);
const uid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = new Date("2026-06-19T12:00:00Z"); // Jun 15 birthdays: "week" has 3 days left

type Log = {
  id: string;
  user_id: string;
  kind: string;
  cycle_start: string;
  sent_on: string;
};
function fakeAdmin(users: { id: string; month: number; day: number }[]) {
  const logs: Log[] = [];
  let next = 0;
  const admin = {
    logs,
    rpc: async (fn: string) => {
      if (fn === "reminder_candidates")
        return {
          data: users.map((u) => ({
            user_id: u.id,
            email: `${u.id}@example.test`,
            display_name: null,
            birth_month: u.month,
            birth_day: u.day,
            time_zone: "UTC",
          })),
          error: null,
        };
      if (fn === "reminder_rewards")
        return {
          data: users.map((u) => ({
            user_id: u.id,
            retailer_id: "week",
            name: "Week",
            reward_description: "A free treat",
            timing_type: "from_birthday",
            days_before: null,
            days_after: 7,
          })),
          error: null,
        };
      return { data: [], error: null }; // pickups
    },
    from: () => ({
      select: () => ({
        in: () => ({ gte: async () => ({ data: [...logs], error: null }) }),
      }),
      insert: (row: Omit<Log, "id">) => ({
        select: () => ({
          single: async () => {
            const clash = logs.some(
              (l) =>
                l.user_id === row.user_id &&
                l.kind === row.kind &&
                l.sent_on === row.sent_on,
            );
            if (clash) return { data: null, error: { code: "23505" } };
            const log = { ...row, id: `log-${next++}` };
            logs.push(log);
            return { data: { id: log.id }, error: null };
          },
        }),
      }),
      delete: () => ({
        eq: async (_: string, id: string) => {
          logs.splice(
            logs.findIndex((l) => l.id === id),
            1,
          );
          return { error: null };
        },
      }),
    }),
  };
  return admin;
}

const deps = (
  admin: ReturnType<typeof fakeAdmin>,
  send = vi.fn(async () => ({ ok: true })),
) => ({
  admin: admin as never,
  send,
  now: NOW,
  siteUrl: "https://example.test",
  tokenFor: (id: string) => createUnsubscribeToken(id, SECRET),
});

describe("runReminders (FR-41, D15)", () => {
  let admin: ReturnType<typeof fakeAdmin>;
  beforeEach(() => {
    admin = fakeAdmin([{ id: uid(1), month: 6, day: 15 }]);
  });

  it("sends an expiring email with the RFC 8058 headers and a token link", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    expect(await runReminders(deps(admin, send))).toEqual({
      candidates: 1,
      sent: 1,
      failed: 0,
      deferred: 0,
    });
    const email = (send.mock.calls[0] as unknown[])[0] as {
      subject: string;
      html: string;
      text: string;
      headers: Record<string, string>;
    };
    expect(email.subject).toBe("1 birthday reward ends soon");
    expect(email.html).toContain("A free treat");
    expect(email.text).toContain("3 days left");
    expect(email.headers["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
    const link =
      /^<(https:\/\/example\.test\/api\/reminders\/unsubscribe\?token=[^>]+)>$/.exec(
        email.headers["List-Unsubscribe"]!,
      );
    expect(link).not.toBeNull();
    const token = new URL(link![1]!).searchParams.get("token");
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(uid(1));
    expect(email.html).toContain("/reminders/unsubscribe?token=");
  });

  it("a second run the same day sends nothing (the claim)", async () => {
    await runReminders(deps(admin));
    const send = vi.fn(async () => ({ ok: true }));
    expect((await runReminders(deps(admin, send))).sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("a failed send releases the claim, so the next run sends", async () => {
    const failing = vi.fn(async () => ({ ok: false }));
    expect(await runReminders(deps(admin, failing))).toMatchObject({
      sent: 0,
      failed: 1,
    });
    expect(admin.logs).toHaveLength(0);
    expect((await runReminders(deps(admin))).sent).toBe(1);
  });

  it("no unsubscribe secret → nothing sent, nothing claimed", async () => {
    const send = vi.fn(async () => ({ ok: true }));
    const r = await runReminders({
      ...deps(admin, send),
      tokenFor: () => null,
    });
    expect(r).toMatchObject({ sent: 0, failed: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(admin.logs).toHaveLength(0);
  });

  it("budget: 41 due → 40 sent, 1 deferred, expiring before plan-ahead", async () => {
    // 21 users in the window (expiring) and 20 a week before their Jun 25 birthday (plan-ahead).
    const users = [
      ...Array.from({ length: 21 }, (_, i) => ({
        id: uid(100 + i),
        month: 6,
        day: 15,
      })),
      ...Array.from({ length: 20 }, (_, i) => ({
        id: uid(i),
        month: 6,
        day: 25,
      })),
    ];
    const many = fakeAdmin(users);
    const send = vi.fn(async () => ({ ok: true }));
    expect(REMINDER_RUN_BUDGET).toBe(40);
    expect(await runReminders(deps(many, send))).toEqual({
      candidates: 41,
      sent: 40,
      failed: 0,
      deferred: 1,
    });
    // All 21 expiring went out; the one left over is a plan-ahead.
    expect(many.logs.filter((l) => l.kind === "expiring")).toHaveLength(21);
    expect(many.logs.filter((l) => l.kind === "plan_ahead")).toHaveLength(19);
  });

  it("no candidates → zero counts, no reads", async () => {
    expect(await runReminders(deps(fakeAdmin([])))).toEqual({
      candidates: 0,
      sent: 0,
      failed: 0,
      deferred: 0,
    });
  });
});

describe("unsubscribe tokens (D15, T-107)", () => {
  it("round-trips, and refuses forged, other-secret, malformed or overlong tokens", () => {
    const t = createUnsubscribeToken(uid(7), SECRET)!;
    expect(t.startsWith(`v1.${uid(7)}.`)).toBe(true);
    expect(verifyUnsubscribeToken(t, SECRET)).toBe(uid(7));
    expect(verifyUnsubscribeToken(t, "y".repeat(40))).toBeNull();
    expect(
      verifyUnsubscribeToken(t.replace(uid(7), uid(8)), SECRET),
    ).toBeNull();
    expect(verifyUnsubscribeToken(`${t}x`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(`${t}.extra`, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken("v1.not-a-uuid.abc", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken("x".repeat(201), SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(null, SECRET)).toBeNull();
  });
  it("no secret → no token and nothing verifies", () => {
    expect(createUnsubscribeToken(uid(7), undefined)).toBeNull();
    expect(
      verifyUnsubscribeToken(createUnsubscribeToken(uid(7), SECRET), undefined),
    ).toBeNull();
  });
});

describe("checkCronAuth (D14)", () => {
  const req = (auth?: string) => ({
    headers: new Headers(auth ? { authorization: auth } : {}),
  });
  it("only the exact bearer passes; no secret refuses everything", () => {
    expect(checkCronAuth(req(`Bearer ${SECRET}`), SECRET)).toBe(true);
    expect(checkCronAuth(req(`Bearer ${SECRET}x`), SECRET)).toBe(false);
    expect(checkCronAuth(req(SECRET), SECRET)).toBe(false);
    expect(checkCronAuth(req(), SECRET)).toBe(false);
    expect(checkCronAuth(req("Bearer "), undefined)).toBe(false);
  });
});
