import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  adminClient,
  createUser,
  deleteUsers,
  publicClient,
  sql,
  type TestUser,
} from "./helpers";

// public.stripe_events (BUILD F-8 "Tests": NFR-2, DESIGN §3). No policies: signed-in users and
// the public can't read or write it; only the webhook (service_role) records and prunes events.
let a: TestUser;
const ID = `evt_test_rls_${Date.now()}`;

beforeAll(async () => {
  a = await createUser("stripe-events");
  const db = sql();
  await db`insert into public.stripe_events (id, type) values (${ID}, 'invoice.paid')`;
  await db.end();
});
afterAll(async () => {
  await adminClient()
    .from("stripe_events")
    .delete()
    .like("id", "evt_test_rls_%");
  await deleteUsers(a);
});

describe("public.stripe_events (NFR-2)", () => {
  it("signed-in users and the public read nothing and write nothing", async () => {
    for (const client of [a.client, publicClient()]) {
      const read = await client.from("stripe_events").select("id");
      expect(read.data ?? []).toEqual([]);
      const write = await client
        .from("stripe_events")
        .insert({ id: `${ID}_x`, type: "invoice.paid" });
      expect(write.error).not.toBeNull();
    }
  });

  it("service_role records, reads and deletes events (the webhook's claim)", async () => {
    const admin = adminClient();
    const id = `${ID}_admin`;
    expect(
      (await admin.from("stripe_events").insert({ id, type: "invoice.paid" }))
        .error,
    ).toBeNull();
    expect(
      (await admin.from("stripe_events").select("id").eq("id", id)).data,
    ).toEqual([{ id }]);
    expect(
      (await admin.from("stripe_events").delete().eq("id", id)).error,
    ).toBeNull();
  });
});
