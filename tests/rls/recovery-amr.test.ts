import { afterAll, describe, expect, it } from "vitest";
import {
  CAPTCHA_TOKEN,
  confirmFromEmail,
  createUser,
  deleteUsers,
  publicClient,
  type TestUser,
} from "./helpers";

// Week-1 check 5 (BUILD CI; D24.6, 0004 P9; decisions/0014): after a reset link, the session's
// `amr` is "otp", exactly like a magic link, so the JWT can't tell a reset session apart. That's
// why /auth/confirm sets the signed auth_recovery marker. If a GoTrue upgrade starts recording
// "recovery", this fails: isRecoverySession already accepts it, and the marker could go.
const users: TestUser[] = [];
afterAll(() => deleteUsers(...users));

describe("recovery session amr (week-1 check 5)", () => {
  it("a reset link's session records amr 'otp' (no 'recovery' entry)", async () => {
    const user = await createUser("amr-recovery");
    users.push(user);
    const { error } = await publicClient().auth.resetPasswordForEmail(
      user.email,
      { captchaToken: CAPTCHA_TOKEN },
    );
    expect(error).toBeNull();

    const client = await confirmFromEmail(user.email);
    const { data } = await client.auth.getClaims();
    const amr = (data?.claims.amr ?? []) as {
      method: string;
      timestamp: number;
    }[];
    expect(amr.map((entry) => entry.method)).toEqual(["otp"]);
    expect(Math.abs(Date.now() / 1000 - amr[0].timestamp)).toBeLessThan(60);
  });
});
