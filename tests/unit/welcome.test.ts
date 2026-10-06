import { beforeEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "@/config/app";

// sendWelcomeIfFirst (BUILD F-5 "Welcome", FR-30, D24.11): claim → send → release on failure,
// never failing the sign-in. Supabase clients and the transport are the faked boundaries.
const send = vi.fn();
const release = vi.fn();
vi.mock("@/server/email/send", () => ({ sendEmail: send }));
vi.mock("@/server/supabase/admin", () => ({
  getAdminClient: () => ({ rpc: release }),
}));
vi.mock("@/server/site-url", () => ({
  getSiteUrl: () => "https://app.example",
}));
vi.mock("@/server/errors", () => ({ logError: vi.fn() }));

const { sendWelcomeIfFirst } = await import("@/server/email/welcome");
const { logError } = await import("@/server/errors");

const claim = vi.fn();
const supabase = { rpc: claim } as never;
const user = { id: "user-1", email: "someone@example.com" };

beforeEach(() => {
  send.mockReset().mockResolvedValue({ ok: true });
  release.mockReset().mockResolvedValue({ error: null });
  claim.mockReset();
  vi.mocked(logError).mockClear();
});

describe("sendWelcomeIfFirst", () => {
  it("first verified sign-in: claims, then sends E-4 to the user", async () => {
    claim.mockResolvedValue({ data: true, error: null });
    await sendWelcomeIfFirst(supabase, user);
    expect(claim).toHaveBeenCalledWith("claim_welcome_email");
    expect(send).toHaveBeenCalledTimes(1);
    const [message] = send.mock.calls[0];
    expect(message).toMatchObject({
      to: "someone@example.com",
      subject: "Welcome",
    });
    expect(message.html).toContain("https://app.example/dashboard");
    expect(message.text).toContain("https://app.example/dashboard");
    expect(release).not.toHaveBeenCalled();
  });

  it("already claimed (a later sign-in, or the other of two at once): nothing sent", async () => {
    claim.mockResolvedValue({ data: false, error: null });
    await sendWelcomeIfFirst(supabase, user);
    expect(send).not.toHaveBeenCalled();
  });

  it("a claim error is logged and nothing is sent", async () => {
    claim.mockResolvedValue({ data: null, error: { code: "PGRST000" } });
    await sendWelcomeIfFirst(supabase, user);
    expect(send).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(expect.anything(), {
      op: "welcome.claim",
      userId: "user-1",
    });
  });

  it("a failed send releases the claim by the verified id, and logs without the email", async () => {
    claim.mockResolvedValue({ data: true, error: null });
    send.mockResolvedValue({ ok: false });
    await sendWelcomeIfFirst(supabase, user);
    expect(release).toHaveBeenCalledWith("release_welcome_email", {
      p_user_id: "user-1",
    });
    const calls = JSON.stringify(
      vi.mocked(logError).mock.calls.map(([e, o]) => [String(e), o]),
    );
    expect(calls).toContain("welcome.release");
    expect(calls).not.toContain("someone@example.com");
  });

  it("never throws, even if the release fails too", async () => {
    claim.mockResolvedValue({ data: true, error: null });
    send.mockResolvedValue({ ok: false });
    release.mockResolvedValue({ error: { code: "XX000" } });
    await expect(sendWelcomeIfFirst(supabase, user)).resolves.toBeUndefined();
  });
});

describe("sendWelcomeIfFirst, #17 review", () => {
  it("a user without an email doesn't use up the claim", async () => {
    await sendWelcomeIfFirst(supabase, { id: "user-2", email: undefined });
    expect(claim).not.toHaveBeenCalled();
  });

  it("replies go to the support address (E-4 says so)", async () => {
    claim.mockResolvedValue({ data: true, error: null });
    await sendWelcomeIfFirst(supabase, user);
    expect(send.mock.calls[0][0].replyTo).toBe(appConfig.supportEmail);
  });

  it("never throws when the release itself throws", async () => {
    claim.mockResolvedValue({ data: true, error: null });
    send.mockResolvedValue({ ok: false });
    release.mockRejectedValue(new TypeError("fetch failed"));
    await expect(sendWelcomeIfFirst(supabase, user)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(expect.any(TypeError), {
      op: "welcome.release",
      userId: "user-1",
    });
  });
});
