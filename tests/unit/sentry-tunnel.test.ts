import { describe, expect, it, vi } from "vitest";
import {
  MAX_ENVELOPE_BYTES,
  tunnelEnvelope,
} from "@/server/observability/sentry-tunnel";

// The /monitoring tunnel (BUILD F-4, D24.16, decisions/0012): forwards the browser SDK's envelopes
// to our own Sentry project only. Test DSNs, not a real project.
const OURS = "https://abc123@o111.ingest.us.sentry.io/222";
const THEIRS = "https://evil999@o999.ingest.us.sentry.io/888";
const UPSTREAM = "https://o111.ingest.us.sentry.io/api/222/envelope/";

const envelope = (header: unknown) =>
  `${typeof header === "string" ? header : JSON.stringify(header)}\n{"type":"event"}\n{"message":"boom"}`;

function request(body: string, headers: Record<string, string> = {}) {
  return new Request("https://app.test/monitoring", {
    method: "POST",
    body,
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      cookie: "sb-access-token=secret",
      "x-forwarded-for": "203.0.113.7",
      ...headers,
    },
  });
}

const okFetch = () =>
  vi.fn<typeof fetch>(
    async () =>
      new Response("{}", {
        status: 200,
        headers: {
          "x-sentry-rate-limits": "60:error:org",
          "set-cookie": "a=b",
        },
      }),
  );

describe("tunnelEnvelope", () => {
  it("forwards our DSN's envelope to our project, with no cookies or visitor IP", async () => {
    const fetchFn = okFetch();
    const body = envelope({ dsn: OURS, sent_at: "2026-09-29T10:00:00Z" });
    const res = await tunnelEnvelope(request(body), { dsn: OURS, fetchFn });

    expect(res.status).toBe(200);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe(UPSTREAM);
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    expect(new TextDecoder().decode(init?.body as Uint8Array)).toBe(body);
    const sent = new Headers(init?.headers);
    expect([...sent.keys()]).toEqual(["content-type"]);
    expect(sent.get("content-type")).toBe("application/x-sentry-envelope");
  });

  it("passes Sentry's rate-limit headers back so the SDK backs off, nothing else", async () => {
    const res = await tunnelEnvelope(request(envelope({ dsn: OURS })), {
      dsn: OURS,
      fetchFn: okFetch(),
    });
    expect(res.headers.get("x-sentry-rate-limits")).toBe("60:error:org");
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(await res.text()).toBe("");
  });

  it("refuses another project's DSN without contacting Sentry (no open relay)", async () => {
    const fetchFn = okFetch();
    for (const dsn of [
      THEIRS,
      "https://abc123@o111.ingest.us.sentry.io/223", // our org, another project
      "https://other@o111.ingest.us.sentry.io/222", // another key
      "https://abc123@o111.ingest.us.sentry.io.evil.test/222",
    ]) {
      const res = await tunnelEnvelope(request(envelope({ dsn })), {
        dsn: OURS,
        fetchFn,
      });
      expect(res.status).toBe(403);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("always sends to the URL built from our DSN, never one from the envelope", async () => {
    const fetchFn = okFetch();
    await tunnelEnvelope(
      request(envelope({ dsn: `${OURS}?x=https://evil.test` })),
      { dsn: OURS, fetchFn },
    );
    for (const [url] of fetchFn.mock.calls) expect(url).toBe(UPSTREAM);
  });

  it.each([
    ["an empty body", ""],
    ["a header that isn't JSON", envelope("not json")],
    ["a header without a dsn", envelope({ sent_at: "x" })],
    ["a dsn that isn't a URL", envelope({ dsn: "nope" })],
    ["a header that's an array", envelope([OURS])],
  ])("rejects %s with 400", async (_what, body) => {
    const fetchFn = okFetch();
    const res = await tunnelEnvelope(request(body), { dsn: OURS, fetchFn });
    expect(res.status).toBe(400);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects a body over the limit, even without a content-length", async () => {
    const fetchFn = okFetch();
    const big = envelope({ dsn: OURS }) + "x".repeat(MAX_ENVELOPE_BYTES);
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(big));
        c.close();
      },
    });
    const req = new Request("https://app.test/monitoring", {
      method: "POST",
      body: stream,
      // @ts-expect-error Node's fetch needs this for a stream body; not in the DOM types
      duplex: "half",
    });
    expect((await tunnelEnvelope(req, { dsn: OURS, fetchFn })).status).toBe(
      413,
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("rejects early on a declared content-length over the limit", async () => {
    const res = await tunnelEnvelope(
      request(envelope({ dsn: OURS }), {
        "content-length": String(MAX_ENVELOPE_BYTES + 1),
      }),
      { dsn: OURS, fetchFn: okFetch() },
    );
    expect(res.status).toBe(413);
  });

  it("is off (404) when no DSN is configured", async () => {
    const fetchFn = okFetch();
    const res = await tunnelEnvelope(request(envelope({ dsn: OURS })), {
      dsn: undefined,
      fetchFn,
    });
    expect(res.status).toBe(404);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("releases Sentry's response body (no connection left waiting)", async () => {
    let cancelled = false;
    const body = new ReadableStream({
      cancel() {
        cancelled = true;
      },
    });
    await tunnelEnvelope(request(envelope({ dsn: OURS })), {
      dsn: OURS,
      fetchFn: vi.fn<typeof fetch>(
        async () => new Response(body, { status: 200 }),
      ),
    });
    expect(cancelled).toBe(true);
  });

  it("answers 502 when Sentry can't be reached, without details", async () => {
    const res = await tunnelEnvelope(request(envelope({ dsn: OURS })), {
      dsn: OURS,
      fetchFn: vi.fn<typeof fetch>(async () => {
        throw new TypeError("fetch failed: getaddrinfo ENOTFOUND");
      }),
    });
    expect(res.status).toBe(502);
    expect(await res.text()).toBe("");
  });
});
