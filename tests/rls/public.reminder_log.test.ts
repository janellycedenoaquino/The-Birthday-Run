import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setPremium } from "../../scripts/grant-premium";
import { runReminders } from "@/server/reminders/run";
import {
  adminClient,
  createUser,
  dayFromToday,
  deleteUsers,
  publicClient,
  sql,
  type TestUser,
} from "./helpers";

// public.reminder_log and the reminder job's functions (BUILD F-12 "Tests": FR-41, FR-42, D15,
// NFR-1). Required for every USER_DATA_TABLES entry. Users read their own claims only; only the
// job (service_role) writes them; the unique keys make two runs at once send each reminder once.
let db: ReturnType<typeof sql>;
let a: TestUser; // premium, birthday in 3 days: a plan-ahead email is due
let b: TestUser; // free
let off: TestUser; // premium, reminders off

/** A birthday `days` from today in UTC, with one listed program. */
async function birthdayIn(user: TestUser, days: number) {
  const [, month, day] = dayFromToday(days).split("-").map(Number);
  await db`update public.profiles set birth_month = ${month!}, birth_day = ${day!},
           time_zone = 'UTC' where id = ${user.id}`;
  await db`insert into public.enrollments (user_id, retailer_id)
           values (${user.id}, '16-handles') on conflict do nothing`;
}

beforeAll(async () => {
  db = sql();
  a = await createUser("remind-a");
  b = await createUser("remind-b");
  off = await createUser("remind-off");
  for (const u of [a, b, off]) await birthdayIn(u, 3);
  await setPremium(db, a.email, "grant");
  await setPremium(db, off.email, "grant");
  await db`update public.profiles set reminders_enabled = false where id = ${off.id}`;
});
afterAll(async () => {
  await deleteUsers(a, b, off);
  await db.end();
});

describe("reminder_candidates and the job's reads (FR-41, FR-42)", () => {
  it("only premium users with reminders on are candidates", async () => {
    const { data, error } = await adminClient().rpc("reminder_candidates");
    expect(error).toBeNull();
    const ids = data!.map((c) => c.user_id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(b.id);
    expect(ids).not.toContain(off.id);
  });

  it("signed-in users and the public can't run any of the job's functions", async () => {
    for (const client of [a.client, publicClient()]) {
      expect((await client.rpc("reminder_candidates")).error).not.toBeNull();
      expect(
        (await client.rpc("reminder_rewards", { p_user_ids: [a.id] })).error,
      ).not.toBeNull();
      expect(
        (
          await client.rpc("reminder_pickups", {
            p_user_ids: [a.id],
            p_since: dayFromToday(-10),
          })
        ).error,
      ).not.toBeNull();
    }
  });
});

describe("two runs at once send each reminder once (D15)", () => {
  it("one plan-ahead claim and one email for A, from two parallel runs", async () => {
    const sent: string[] = [];
    const send = vi.fn(async (email: { to: string }) => {
      sent.push(email.to);
      return { ok: true };
    });
    const deps = {
      admin: adminClient(),
      send,
      now: new Date(),
      siteUrl: "http://localhost:3000",
      tokenFor: () => "v1.token.for-tests",
    };
    await Promise.all([runReminders(deps), runReminders(deps)]);
    expect(sent.filter((to) => to === a.email)).toEqual([a.email]);
    const rows =
      await db`select kind from public.reminder_log where user_id = ${a.id}`;
    expect(rows.map((r) => r.kind)).toEqual(["plan_ahead"]);
    expect(sent).not.toContain(b.email);
    expect(sent).not.toContain(off.email);
  });
});

describe("public.reminder_log RLS (NFR-1)", () => {
  it("A reads their own claims; B sees none of them; signed out sees nothing", async () => {
    expect((await a.client.from("reminder_log").select("kind")).data).toEqual([
      { kind: "plan_ahead" },
    ]);
    expect((await b.client.from("reminder_log").select("id")).data).toEqual([]);
    expect(
      (await publicClient().from("reminder_log").select("id")).data ?? [],
    ).toEqual([]);
  });

  it("A can't insert or delete claims (only the job does)", async () => {
    const insert = await a.client.from("reminder_log").insert({
      user_id: a.id,
      kind: "expiring",
      cycle_start: dayFromToday(-30),
      sent_on: dayFromToday(0),
    });
    expect(insert.error).not.toBeNull();
    await a.client.from("reminder_log").delete().eq("user_id", a.id);
    const rows =
      await db`select count(*)::int as n from public.reminder_log where user_id = ${a.id}`;
    expect(rows[0]!.n).toBe(1);
  });

  it("the claims go with the account (cascade)", async () => {
    const c = await createUser("remind-cascade");
    await db`insert into public.reminder_log (user_id, kind, cycle_start, sent_on)
             values (${c.id}, 'expiring', ${dayFromToday(-30)}, ${dayFromToday(0)})`;
    await deleteUsers(c);
    const rows =
      await db`select count(*)::int as n from public.reminder_log where user_id = ${c.id}`;
    expect(rows[0]!.n).toBe(0);
  });
});
