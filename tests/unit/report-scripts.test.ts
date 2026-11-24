import { describe, expect, it, vi } from "vitest";
import {
  checkStale,
  staleBody,
  staleRetailers,
} from "../../scripts/check-stale-retailers.ts";
import { forwardReports, issueBody } from "../../scripts/forward-reports.ts";
import type { LocalDate } from "@/lib/birthday/timing";
import { csv, line } from "./csv-fixture";
import { memoryIssues } from "./memory-issues";

// BUILD F-13 "Tests": the two Action scripts with the in-memory IssueSink and a mocked fetch.
// forward-reports (NFR-11): the issue text is the fixed template, an open issue gets a comment
// rather than a second issue, and an invalid summary fails before any issue call or ack.
// check-stale-retailers (FR-47): a fixed "today", month-end clamp, oldest first, none → no call.
const BATCH = "00000000-0000-4000-8000-000000000007";
const CSV = csv(
  line({ id: "cafe-one", name: "Cafe One" }),
  line({ id: "tea-two", name: "Tea Two", website_url: "https://tea.example" }),
);

function api(summary: unknown, ackStatus = 200) {
  const calls: string[] = [];
  const fetch = vi.fn(
    async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u}`);
      expect(new Headers(init?.headers).get("authorization")).toBe(
        "Bearer s3cret",
      );
      if (u.endsWith("/api/reports/pending")) return Response.json(summary);
      return Response.json({ acked: 3 }, { status: ackStatus });
    },
  );
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}
const run = (summary: unknown, sink = memoryIssues(), ackStatus = 200) => {
  const a = api(summary, ackStatus);
  return {
    sink,
    a,
    result: forwardReports({
      siteUrl: "https://site.example/",
      secret: "s3cret",
      sink: sink.sink,
      csvText: CSV,
      fetch: a.fetch,
    }),
  };
};

describe("forward-reports (NFR-11, D16)", () => {
  const summary = {
    batchId: BATCH,
    items: [
      { retailerId: "cafe-one", reason: "expired", count: 2 },
      { retailerId: "cafe-one", reason: "wrong_timing", count: 1 },
    ],
  } as const;

  it("opens one issue per retailer from the fixed template, then acks", async () => {
    const { sink, a, result } = run(summary);
    expect(await result).toEqual({ retailers: 1, acked: 3 });
    expect(sink.issues).toHaveLength(1);
    expect(sink.issues[0]).toMatchObject({
      label: "reward-report",
      title: "Reward report: cafe-one",
      body: issueBody(
        "cafe-one",
        {
          name: "Cafe One",
          source_url: "https://cafe.example/rewards",
          website_url: "https://cafe.example",
          last_checked_on: "2026-11-01",
        },
        summary.items,
      ),
    });
    expect(sink.issues[0]!.body).toContain("- expired × 2\n- wrong_timing × 1");
    expect(a.calls).toEqual([
      "GET https://site.example/api/reports/pending",
      "POST https://site.example/api/reports/ack",
    ]);
  });

  it("an open issue gets a comment, not a second issue", async () => {
    const existing = memoryIssues([
      {
        number: 7,
        label: "reward-report",
        title: "Reward report: cafe-one",
        body: "x",
      },
    ]);
    const { sink, result } = run(summary, existing);
    await result;
    expect(sink.calls).toEqual(["findOpen", "comment"]);
    expect(sink.issues).toHaveLength(1);
    expect(sink.issues[0]!.comments[0]).toBe(
      "New reports (reason × count):\n- expired × 2\n- wrong_timing × 1",
    );
  });

  it("a retailer missing from the CSV still gets an issue, saying so", async () => {
    const { sink, result } = run({
      batchId: BATCH,
      items: [{ retailerId: "gone-shop", reason: "store_closed", count: 1 }],
    });
    await result;
    expect(sink.issues[0]!.body).toContain("Not in data/retailers.csv");
  });

  it.each([
    [
      "free text in a reason",
      {
        batchId: BATCH,
        items: [{ retailerId: "cafe-one", reason: "call me", count: 1 }],
      },
    ],
    [
      "an extra field",
      {
        batchId: BATCH,
        items: [
          {
            retailerId: "cafe-one",
            reason: "expired",
            count: 1,
            email: "a@b.c",
          },
        ],
      },
    ],
    [
      "a markdown retailer ID",
      {
        batchId: BATCH,
        items: [
          { retailerId: "[x](http://evil)", reason: "expired", count: 1 },
        ],
      },
    ],
    [
      "a zero count",
      {
        batchId: BATCH,
        items: [{ retailerId: "cafe-one", reason: "expired", count: 0 }],
      },
    ],
    ["a top-level extra key", { ...{ batchId: BATCH, items: [] }, note: "hi" }],
  ])("%s fails before any issue call or ack", async (_, bad) => {
    const { sink, a, result } = run(bad);
    await expect(result).rejects.toThrow();
    expect(sink.calls).toEqual([]);
    expect(a.calls).toEqual(["GET https://site.example/api/reports/pending"]);
  });

  it("nothing pending → no issue call and no ack", async () => {
    const { sink, a, result } = run({ batchId: null, items: [] });
    expect(await result).toEqual({ retailers: 0, acked: 0 });
    expect(sink.calls).toEqual([]);
    expect(a.calls).toHaveLength(1);
  });

  it("a failed ack fails the run", async () => {
    const { result } = run(summary, memoryIssues(), 500);
    await expect(result).rejects.toThrow(/ack: HTTP 500/);
  });
});

describe("check-stale-retailers (FR-47, A-10)", () => {
  const row = (id: string, last: string) => ({
    id,
    name: id,
    last_checked_on: last,
    source_url: `https://${id}.example`,
  });

  it("stale = checked before today minus 6 months, oldest first", () => {
    const rows = [
      row("b", "2026-05-14"),
      row("a", "2026-05-15"), // exactly 6 months: not stale
      row("c", "2025-12-01"),
    ];
    expect(
      staleRetailers(rows, "2026-11-15" as LocalDate).map((r) => r.id),
    ).toEqual(["c", "b"]);
  });

  it("clamps to the month's end (Aug 31 → Feb 28)", () => {
    const rows = [row("x", "2026-02-27"), row("y", "2026-02-28")];
    expect(
      staleRetailers(rows, "2026-08-31" as LocalDate).map((r) => r.id),
    ).toEqual(["x"]);
  });

  it("none stale → no issue call", async () => {
    const sink = memoryIssues();
    const stale = await checkStale({
      csvText: CSV,
      today: "2026-11-23" as LocalDate,
      sink: sink.sink,
    });
    expect(stale).toEqual([]);
    expect(sink.calls).toEqual([]);
  });

  it("stale → creates the one issue, then replaces its body next time", async () => {
    const old = csv(line({ id: "cafe-one", last_checked_on: "2026-01-02" }));
    const sink = memoryIssues();
    const opts = {
      csvText: old,
      today: "2026-11-23" as LocalDate,
      sink: sink.sink,
    };
    await checkStale(opts);
    await checkStale(opts);
    expect(sink.calls).toEqual(["findOpen", "create", "findOpen", "editBody"]);
    expect(sink.issues).toHaveLength(1);
    expect(sink.issues[0]).toMatchObject({
      label: "stale-retailers",
      title: "Retailers to re-check",
      body: staleBody([
        {
          id: "cafe-one",
          name: "Cafe One",
          last_checked_on: "2026-01-02",
          source_url: "https://cafe.example/rewards",
        },
      ]),
    });
  });
});
