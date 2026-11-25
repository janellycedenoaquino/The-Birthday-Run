import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lastHeartbeat, recordHeartbeat } from "@/server/heartbeat";
import {
  adminClient,
  createUser,
  deleteUsers,
  publicClient,
  type TestUser,
} from "./helpers";

// public.job_heartbeats (D16 heartbeat, DESIGN §3). No policies: signed-in users and the public
// can't read or write it; only the server (service_role) records and reads the last cron run.
let a: TestUser;
beforeAll(async () => {
  a = await createUser("heartbeats");
});
afterAll(async () => {
  await adminClient().from("job_heartbeats").delete().eq("job", "reminders");
  await deleteUsers(a);
});

describe("public.job_heartbeats (D16)", () => {
  it("records and reads the last run; a second run replaces it", async () => {
    const admin = adminClient();
    await recordHeartbeat(admin, "reminders", new Date("2026-11-24T14:00:00Z"));
    await recordHeartbeat(admin, "reminders", new Date("2026-11-25T14:00:00Z"));
    const last = await lastHeartbeat(admin, "reminders");
    expect(Date.parse(last ?? "")).toBe(Date.parse("2026-11-25T14:00:00Z"));
  });

  it("an unknown job name is refused", async () => {
    await expect(
      recordHeartbeat(adminClient(), "other", new Date()),
    ).rejects.toThrow();
  });

  it("signed-in users and the public read nothing and write nothing", async () => {
    for (const client of [a.client, publicClient()]) {
      const read = await client.from("job_heartbeats").select("job");
      expect(read.data ?? []).toEqual([]);
      const write = await client
        .from("job_heartbeats")
        .upsert({ job: "reminders", last_run_at: new Date().toISOString() });
      expect(write.error).not.toBeNull();
    }
  });
});
