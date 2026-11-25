import { beforeEach, describe, expect, it, vi } from "vitest";

// BUILD F-13 "Tests": the two report routes (D16, NFR-11). A missing or wrong bearer → 401;
// the pending answer has exactly retailerId/reason/count per item and no-store; a bad ack body
// → 400. The admin client's two RPCs are the faked boundary.
vi.mock("@/server/errors", async (io) =>
  (await import("./mock-helpers")).quietErrors(io),
);
const SECRET = "r".repeat(40);
vi.mock("@/server/env", () => ({
  env: { REPORTS_EXPORT_SECRET: SECRET, CRON_SECRET: "c".repeat(40) },
}));
const rpc = vi.fn();
vi.mock("@/server/supabase/admin", () => ({
  getAdminClient: () => ({ rpc }),
}));
const BEAT = "2026-11-25T14:00:03.000Z";
const lastHeartbeat = vi.fn(async (): Promise<string | null> => BEAT);
vi.mock("@/server/heartbeat", () => ({ lastHeartbeat }));

const pending = await import("@/app/api/reports/pending/route");
const ack = await import("@/app/api/reports/ack/route");
const BATCH = "00000000-0000-4000-8000-000000000001";
const get = (auth?: string) =>
  pending.GET(
    new Request("https://example.test/api/reports/pending", {
      headers: auth ? { authorization: auth } : {},
    }),
  );
const post = (body: string, auth = `Bearer ${SECRET}`) =>
  ack.POST(
    new Request("https://example.test/api/reports/ack", {
      method: "POST",
      headers: { authorization: auth, "content-type": "application/json" },
      body,
    }),
  );

beforeEach(() => rpc.mockReset());

describe("GET /api/reports/pending (D16)", () => {
  it.each([
    ["no bearer", undefined],
    ["a wrong bearer", "Bearer nope"],
    ["the cron secret", `Bearer ${"c".repeat(40)}`],
  ])("%s → 401, nothing claimed", async (_, auth) => {
    const res = await get(auth);
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns counts only: retailerId, reason, count", async () => {
    rpc.mockResolvedValue({
      data: [
        { retailer_id: "starbucks", reason: "expired", report_count: 2 },
        { retailer_id: "starbucks", reason: "wrong_timing", report_count: 1 },
      ],
      error: null,
    });
    const res = await get(`Bearer ${SECRET}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual([
      "batchId",
      "items",
      "lastReminderRunAt",
    ]);
    // D16 heartbeat: a time only, never user data.
    expect(body.lastReminderRunAt).toBe(BEAT);
    expect(body.batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(rpc).toHaveBeenCalledWith("claim_report_batch", {
      p_batch: body.batchId,
    });
    for (const item of body.items)
      expect(Object.keys(item).sort()).toEqual([
        "count",
        "reason",
        "retailerId",
      ]);
    expect(body.items[0]).toEqual({
      retailerId: "starbucks",
      reason: "expired",
      count: 2,
    });
  });

  it("nothing pending → batchId null", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    lastHeartbeat.mockResolvedValueOnce(null);
    expect(await (await get(`Bearer ${SECRET}`)).json()).toEqual({
      batchId: null,
      items: [],
      lastReminderRunAt: null,
    });
  });

  it("a database error → 500 with no details", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const res = await get(`Bearer ${SECRET}`);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "failed" });
  });
});

describe("POST /api/reports/ack (D16)", () => {
  it("a wrong bearer → 401", async () => {
    const res = await post(JSON.stringify({ batchId: BATCH }), "Bearer nope");
    expect(res.status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["not JSON", "{"],
    ["no batchId", "{}"],
    ["not a UUID", JSON.stringify({ batchId: "x" })],
    ["an extra key", JSON.stringify({ batchId: BATCH, all: true })],
  ])("%s → 400", async (_, body) => {
    const res = await post(body);
    expect(res.status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("acks the batch and returns the count", async () => {
    rpc.mockResolvedValue({ data: 3, error: null });
    const res = await post(JSON.stringify({ batchId: BATCH }));
    expect(await res.json()).toEqual({ acked: 3 });
    expect(rpc).toHaveBeenCalledWith("ack_report_batch", { p_batch: BATCH });
  });
});
