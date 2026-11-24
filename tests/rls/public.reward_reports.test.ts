import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ackBatch, claimPendingSummary } from "@/server/reports/summary";
import {
  adminClient,
  birthdayTodayWith,
  createUser,
  dayFromToday,
  deleteUsers,
  publicClient,
  sql,
  type TestUser,
} from "./helpers";

// public.reward_reports and the report batch functions (BUILD F-13 "Tests": FR-48, NFR-1, D16).
// Users insert and read their own reports only; nobody can change or delete them through the
// API; the database sets the cycle, so one report per retailer per cycle can't be dodged.
let db: ReturnType<typeof sql>;
let a: TestUser;
let b: TestUser;
let fresh: TestUser; // no birthday yet
let ids: string[];

const report = (
  user: TestUser,
  retailer_id: string,
  cycle_start = "2000-01-01",
) =>
  user.client.from("reward_reports").insert({
    user_id: user.id,
    retailer_id,
    reason: "expired",
    cycle_start,
  });
const rowsOf = (user: TestUser) =>
  db<
    {
      retailer_id: string;
      cycle_start: string;
      batch_id: string | null;
      forwarded_at: Date | null;
    }[]
  >`
    select retailer_id, cycle_start::text, batch_id, forwarded_at
    from public.reward_reports where user_id = ${user.id} order by retailer_id`;

beforeAll(async () => {
  db = sql();
  ids = (
    await db<{ id: string }[]>`
      select id from public.retailers where retired_at is null order by id limit 3`
  ).map((r) => r.id);
  a = await createUser("report-a");
  b = await createUser("report-b");
  fresh = await createUser("report-fresh", { onboarded: false });
  await birthdayTodayWith(a, []);
  await birthdayTodayWith(b, []);
});
afterAll(async () => {
  await deleteUsers(a, b, fresh);
  await db.end();
});

describe("one report per retailer per cycle (FR-48)", () => {
  it("A's report is stored with today's cycle, whatever cycle_start was sent", async () => {
    expect((await report(a, ids[0]!)).error).toBeNull();
    const [row] = await rowsOf(a);
    // Birthday today: the cycle started 31 days ago (decision 0008).
    expect(row).toMatchObject({
      retailer_id: ids[0],
      cycle_start: dayFromToday(-31),
    });
  });

  it("a second report this cycle is refused (23505 → BR-14), even with another date", async () => {
    const again = await report(a, ids[0]!, "1999-01-01");
    expect(again.error?.code).toBe("23505");
    expect(await rowsOf(a)).toHaveLength(1);
  });

  it("last cycle's report doesn't block this cycle's", async () => {
    await db`insert into public.reward_reports (user_id, retailer_id, reason, cycle_start)
             values (${b.id}, ${ids[1]!}, 'expired', ${dayFromToday(-400)})`;
    expect((await report(b, ids[1]!)).error).toBeNull();
    expect(await rowsOf(b)).toHaveLength(2);
  });

  it("someone with no birthday can't report", async () => {
    const { error } = await report(fresh, ids[0]!);
    expect(error?.message).toBe("not_onboarded");
  });

  it("a retired retailer can't be reported (BR-3)", async () => {
    const [last] = await db<{ id: string }[]>`
      select id from public.retailers where retired_at is null order by id desc limit 1`;
    await db`update public.retailers set retired_at = now() where id = ${last!.id}`;
    try {
      expect((await report(a, last!.id)).error?.code).toBe("42501");
    } finally {
      await db`update public.retailers set retired_at = null where id = ${last!.id}`;
    }
  });
});

describe("public.reward_reports RLS (NFR-1, DESIGN §3)", () => {
  it("A reads only their own; signed out reads nothing", async () => {
    const own = await a.client.from("reward_reports").select("user_id");
    expect(own.data?.map((r) => r.user_id)).toEqual([a.id]);
    expect(
      (await publicClient().from("reward_reports").select("id")).data ?? [],
    ).toEqual([]);
  });

  it("A can't report as B", async () => {
    const { error } = await a.client.from("reward_reports").insert({
      user_id: b.id,
      retailer_id: ids[2]!,
      reason: "expired",
      cycle_start: dayFromToday(0),
    });
    expect(error).not.toBeNull();
    expect((await rowsOf(b)).map((r) => r.retailer_id)).not.toContain(ids[2]);
  });

  it("nobody can set batch_id or forwarded_at, or delete a report", async () => {
    await a.client
      .from("reward_reports")
      .update({ forwarded_at: new Date().toISOString() } as never)
      .eq("user_id", a.id);
    await a.client
      .from("reward_reports")
      .update({ batch_id: "00000000-0000-4000-8000-000000000000" } as never)
      .eq("user_id", a.id);
    await a.client.from("reward_reports").delete().eq("user_id", a.id);
    const [row] = await rowsOf(a);
    expect(row).toMatchObject({ batch_id: null, forwarded_at: null });
    const insertExtra = await a.client.from("reward_reports").insert({
      user_id: a.id,
      retailer_id: ids[2]!,
      reason: "expired",
      cycle_start: dayFromToday(0),
      forwarded_at: new Date().toISOString(),
    } as never);
    expect(insertExtra.error).not.toBeNull();
  });

  it("signed-in users and the public can't claim or ack batches", async () => {
    const batch = "00000000-0000-4000-8000-000000000009";
    for (const client of [a.client, publicClient()]) {
      expect(
        (await client.rpc("claim_report_batch", { p_batch: batch })).error,
      ).not.toBeNull();
      expect(
        (await client.rpc("ack_report_batch", { p_batch: batch })).error,
      ).not.toBeNull();
    }
    expect((await rowsOf(a))[0]!.batch_id).toBeNull();
  });

  it("the reports go with the account (cascade)", async () => {
    const c = await createUser("report-cascade");
    await db`insert into public.reward_reports (user_id, retailer_id, reason, cycle_start)
             values (${c.id}, ${ids[0]!}, 'store_closed', ${dayFromToday(0)})`;
    await deleteUsers(c);
    expect(await rowsOf(c)).toEqual([]);
  });
});

describe("claim and ack (D16)", () => {
  const admin = () => adminClient();
  const mine = async () =>
    (await rowsOf(a))
      .concat(await rowsOf(b))
      .filter((r) => r.forwarded_at === null);

  it("a claim returns counts only and stamps every pending report", async () => {
    const first = await claimPendingSummary({ admin: admin() });
    expect(first.batchId).not.toBeNull();
    for (const item of first.items)
      expect(Object.keys(item).sort()).toEqual([
        "count",
        "reason",
        "retailerId",
      ]);
    expect(first.items).toContainEqual({
      retailerId: ids[0],
      reason: "expired",
      count: 1,
    });
    expect((await mine()).every((r) => r.batch_id === first.batchId)).toBe(
      true,
    );

    // Unacked: the next claim offers them again under a new batch; the old ack changes nothing.
    const second = await claimPendingSummary({ admin: admin() });
    expect(second.batchId).not.toBe(first.batchId);
    expect(second.items).toContainEqual({
      retailerId: ids[0],
      reason: "expired",
      count: 1,
    });
    expect(await ackBatch({ admin: admin(), batchId: first.batchId! })).toBe(0);
    expect((await mine()).length).toBeGreaterThan(0);

    // Acking the newest batch marks them forwarded; nothing of theirs is pending after.
    expect(
      await ackBatch({ admin: admin(), batchId: second.batchId! }),
    ).toBeGreaterThan(0);
    expect(await mine()).toEqual([]);
    const third = await claimPendingSummary({ admin: admin() });
    expect(third.items.filter((i) => i.retailerId === ids[0])).toEqual([]);
  });
});
