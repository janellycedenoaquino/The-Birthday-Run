import * as Sentry from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logError,
  padToMinimum,
  toUserMessage,
  withNotice,
} from "@/server/errors";
import { M } from "@/lib/messages";

// BUILD F-2 "Errors and messages", §0.3, §0.7 (NFR-9, rule 12, rule 20). Sentry is an external
// service, so it's mocked (BUILD §0.8 dependency table).

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const EMAIL = "bob@example.com";
let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.clearAllMocks());

describe("toUserMessage", () => {
  it.each([
    ["captcha_failed", "M-6"],
    ["same_password", "API-7"],
    ["weak_password", "M-32"],
    ["over_request_rate_limit", "M-5"],
  ])("maps Supabase %s to %s", (code, id) => {
    expect(toUserMessage(code)).toBe(id);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it.each(["unexpected_failure", "", undefined, "__proto__", "toString"])(
    "maps unknown code %j to M-7 and logs it",
    (code) => {
      expect(toUserMessage(code)).toBe("M-7");
      expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    },
  );

  it("only ever returns catalogue IDs", () => {
    for (const code of ["captcha_failed", "x", undefined])
      expect(Object.keys(M)).toContain(toUserMessage(code));
  });
});

describe("logError", () => {
  it("reports to Sentry tagged with the operation, without the user ID", () => {
    const error = new Error("boom");
    logError(error, { op: "signIn", userId: "user-123" });
    expect(Sentry.captureException).toHaveBeenCalledWith(error, {
      tags: { op: "signIn" },
    });
  });

  it("writes a scrubbed line to the server console", () => {
    logError(new Error(`no account for ${EMAIL}`), { op: "signUp" });
    const line = consoleError.mock.calls.flat().join(" ");
    expect(line).toContain("signUp");
    expect(line).toContain("[email]");
    expect(line).not.toContain(EMAIL);
  });

  it("never throws, even for odd values or a failing Sentry", () => {
    vi.mocked(Sentry.captureException).mockImplementationOnce(() => {
      throw new Error("sentry down");
    });
    expect(() => logError({ weird: EMAIL }, { op: "x" })).not.toThrow();
    expect(() => logError(null, { op: "x" })).not.toThrow();
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain(EMAIL);
  });
});

describe("padToMinimum", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits out the rest of the minimum", async () => {
    const start = Date.now();
    vi.advanceTimersByTime(120);
    let done = false;
    const p = padToMinimum(start, 500).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(379);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
  });

  it("returns at once when the minimum has passed", async () => {
    const start = Date.now();
    vi.advanceTimersByTime(600);
    let done = false;
    const p = padToMinimum(start, 500).then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(done).toBe(true);
  });
});

describe("withNotice", () => {
  it("adds ?notice= to a same-site path, keeping its query", () => {
    expect(withNotice("/", "account_deleted")).toBe("/?notice=account_deleted");
    expect(withNotice("/dashboard?tab=1", "password_set")).toBe(
      "/dashboard?tab=1&notice=password_set",
    );
  });

  it("refuses an off-site path", () => {
    expect(() => withNotice("//evil.example", "password_changed")).toThrow();
    expect(() => withNotice("https://evil.example", "password_set")).toThrow();
  });
});

describe("logError sentryEveryMs (#12 review: outages repeat on every request)", () => {
  afterEach(() => vi.useRealTimers());

  it("sends an op to Sentry at most once per window, but logs every time", () => {
    vi.useFakeTimers({ now: new Date("2026-09-29T10:00:00Z") });
    const console_ = vi.spyOn(console, "error").mockImplementation(() => {});
    const capture = vi.mocked(Sentry.captureException);
    capture.mockClear();
    const opts = { op: "test.outage", sentryEveryMs: 60_000 };

    logError(new Error("down"), opts);
    logError(new Error("down"), opts);
    vi.advanceTimersByTime(59_999);
    logError(new Error("down"), opts);
    expect(capture).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    logError(new Error("down"), opts);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(console_).toHaveBeenCalledTimes(4);
    console_.mockRestore();
  });

  it("doesn't throttle other ops or calls without the option", () => {
    const capture = vi.mocked(Sentry.captureException);
    capture.mockClear();
    vi.spyOn(console, "error").mockImplementation(() => {});
    logError(new Error("a"), { op: "test.other", sentryEveryMs: 60_000 });
    logError(new Error("b"), { op: "test.plain" });
    logError(new Error("b"), { op: "test.plain" });
    expect(capture).toHaveBeenCalledTimes(3);
  });
});
