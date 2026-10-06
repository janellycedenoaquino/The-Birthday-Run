import { beforeEach, describe, expect, it, vi } from "vitest";

// sendEmail (BUILD F-5 "Transport", D7): Resend or Mailpit, never throws, never logs the
// recipient. Resend's SDK and the network are the faked boundaries.
const env = {
  EMAIL_TRANSPORT: "mailpit" as "mailpit" | "resend",
  EMAIL_FROM: "Template App <hello@example.com>",
  MAILPIT_URL: "http://127.0.0.1:54324",
  RESEND_API_KEY: "test-resend-key",
};
const resendSend = vi.fn();
vi.mock("@/server/env", () => ({ env }));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendSend };
  },
}));
vi.mock("@/server/errors", () => ({ logError: vi.fn() }));

const { sendEmail } = await import("@/server/email/send");
const { logError } = await import("@/server/errors");

const email = {
  to: "someone@example.com",
  subject: "Welcome",
  html: "<p>Hi</p>",
  text: "Hi",
};

beforeEach(() => {
  env.EMAIL_TRANSPORT = "mailpit";
  resendSend.mockReset();
  vi.mocked(logError).mockClear();
});

const logged = () =>
  JSON.stringify(vi.mocked(logError).mock.calls.map(([e]) => String(e)));

describe("sendEmail via Mailpit (local, CI)", () => {
  it("posts Mailpit's send API shape (week-1 check 2)", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({ ID: "x" }));
    expect(await sendEmail(email, { fetchFn })).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:54324/api/v1/send");
    expect(JSON.parse(init?.body as string)).toEqual({
      From: { Name: "Template App", Email: "hello@example.com" },
      To: [{ Email: "someone@example.com" }],
      Subject: "Welcome",
      HTML: "<p>Hi</p>",
      Text: "Hi",
    });
  });

  it("a bare From address works too", async () => {
    env.EMAIL_FROM = "hello@example.com";
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({}));
    await sendEmail(email, { fetchFn });
    expect(JSON.parse(fetchFn.mock.calls[0][1]?.body as string).From).toEqual({
      Email: "hello@example.com",
    });
    env.EMAIL_FROM = "Template App <hello@example.com>";
  });

  it.each([
    [
      "an HTTP error",
      vi.fn<typeof fetch>(async () => new Response("", { status: 500 })),
    ],
    [
      "a timeout",
      vi.fn<typeof fetch>(async () => {
        throw new DOMException("timeout", "TimeoutError");
      }),
    ],
  ])(
    "%s → { ok: false }, no throw, recipient not logged",
    async (_why, fetchFn) => {
      expect(await sendEmail(email, { fetchFn })).toEqual({ ok: false });
      expect(logError).toHaveBeenCalledTimes(1);
      expect(logged()).not.toContain("someone@example.com");
    },
  );
});

describe("sendEmail via Resend (deployed)", () => {
  beforeEach(() => (env.EMAIL_TRANSPORT = "resend"));

  it("sends with the configured sender", async () => {
    resendSend.mockResolvedValue({ data: { id: "1" }, error: null });
    expect(await sendEmail(email)).toEqual({ ok: true });
    expect(resendSend).toHaveBeenCalledWith({ from: env.EMAIL_FROM, ...email });
  });

  it("a Resend error → { ok: false }, recipient not logged", async () => {
    resendSend.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        message: "bad to: someone@example.com",
      },
    });
    expect(await sendEmail(email)).toEqual({ ok: false });
    expect(logged()).not.toContain("someone@example.com");
  });

  it("a thrown SDK error → { ok: false }", async () => {
    resendSend.mockRejectedValue(new Error("network"));
    expect(await sendEmail(email)).toEqual({ ok: false });
  });
});

describe("sendEmail, #17 review", () => {
  it("passes Reply-To to Mailpit and Resend", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => Response.json({}));
    await sendEmail({ ...email, replyTo: "support@example.com" }, { fetchFn });
    expect(
      JSON.parse(fetchFn.mock.calls[0][1]?.body as string).ReplyTo,
    ).toEqual([{ Email: "support@example.com" }]);
    env.EMAIL_TRANSPORT = "resend";
    resendSend.mockResolvedValue({ data: {}, error: null });
    await sendEmail({ ...email, replyTo: "support@example.com" });
    expect(resendSend.mock.calls[0][0].replyTo).toBe("support@example.com");
  });

  it("a stalled Resend call gives up after 10 s instead of hanging the sign-in", async () => {
    vi.useFakeTimers();
    env.EMAIL_TRANSPORT = "resend";
    resendSend.mockReturnValue(new Promise(() => {}));
    const result = sendEmail(email);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await result).toEqual({ ok: false });
    vi.useRealTimers();
  });
});
