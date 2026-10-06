import { expect, test } from "@playwright/test";
import { totp } from "../rls/totp";
import {
  confirmLink,
  newestMail,
  passwordSignIn,
  waitForTurnstile,
  watchCsp,
} from "./support";

// The whole account life cycle in one browser (BUILD CI "E2E journey", FR-39, metric 2): sign up →
// verify → welcome → set password → sign out → sign in → reset → MFA on → sign in with code →
// MFA off → export → delete; plus the header (NFR-13), cookie/storage (NFR-14) and CSP-console
// checks along the way. Locally and in CI it reads Mailpit; E2E_TARGET=deployed pastes links.

const DEPLOYED = process.env.E2E_TARGET === "deployed";
const EMAIL =
  process.env.E2E_EMAIL ??
  `journey-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
const FIRST = "journey-first-password-1";
const SECOND = "journey-second-password-2";

/** A code valid for a while yet: skips to the next 30 s step near its end (no boundary flake). */
function code(secret: string, afterStepOf?: number) {
  const now = Date.now();
  const step = Math.floor(now / 30_000);
  const left = 30_000 - (now % 30_000);
  if (afterStepOf === step || left < 3_000)
    return totp(secret, (step + 1) * 30_000 + 1_000);
  return totp(secret, now);
}
const stepNow = () => Math.floor(Date.now() / 30_000);
async function untilStepAfter(step: number) {
  while (stepNow() <= step) await new Promise((r) => setTimeout(r, 500));
}

test("the account journey (FR-39)", async ({ page, context }) => {
  // Deployed: a person ticks Turnstile and pastes emailed links, so allow for that.
  test.setTimeout(
    process.env.E2E_TARGET === "deployed" ? 30 * 60_000 : 180_000,
  );
  const violations = await watchCsp(page);

  // Sign up with an email only (D10).
  await page.goto("/sign-up");
  await page.getByLabel("Email", { exact: true }).fill(EMAIL);
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();

  // Verify → S-9, then the welcome email (FR-30).
  await page.goto(await confirmLink(EMAIL, /^Confirm your email$/));
  await expect(page).toHaveURL(/\/auth\/set-password/);
  if (!DEPLOYED) {
    const welcome = await newestMail(EMAIL, /^Welcome$/);
    expect(welcome.html).toContain("/dashboard");
  }
  await page.locator('input[name="password"]').fill(FIRST);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("You're all set.")).toBeVisible();

  // NFR-14: session cookies HttpOnly, Secure, Lax; nothing in browser storage.
  const session = (await context.cookies()).filter((c) =>
    c.name.startsWith("sb-"),
  );
  expect(session.length).toBeGreaterThan(0);
  for (const cookie of session)
    expect(cookie, cookie.name).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
    });
  const stored = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  expect(stored).not.toMatch(/sb-|eyJ/);

  // NFR-13: the security headers on a page response.
  const headers = (await page.request.get("/dashboard")).headers();
  expect(headers["content-security-policy"]).toMatch(
    /script-src [^;]*'nonce-[^']+'/,
  );
  expect(headers["strict-transport-security"]).toMatch(/max-age=\d+/);
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBeTruthy();
  expect(headers["x-powered-by"]).toBeUndefined();
  expect(headers["permissions-policy"]).toBeTruthy();

  const signOut = async () => {
    await page.getByRole("button", { name: EMAIL }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/$/);
  };

  // Sign out, sign in with the password.
  await signOut();
  await passwordSignIn(page, EMAIL, FIRST);
  await expect(page).toHaveURL(/\/dashboard$/);

  // Reset the password (FR-7, FR-8).
  await signOut();
  await page.goto("/forgot-password");
  await page.getByLabel("Email", { exact: true }).fill(EMAIL);
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
  await page.goto(await confirmLink(EMAIL, /^Reset your password$/));
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.locator('input[name="password"]').fill(SECOND);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("Password changed.")).toBeVisible();

  // MFA on (the reset session is recent) (FR-57).
  await page.goto("/settings#two-step");
  await page.getByRole("button", { name: "Set up two-step sign-in" }).click();
  const secret = (await page.locator("code").innerText()).replace(/\s+/g, "");
  await page.getByLabel("6-digit code").fill(code(secret));
  const enrolledStep = stepNow();
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Two-step sign-in is on.").first()).toBeVisible();

  // Sign in with the new password and a code (FR-58).
  await signOut();
  await passwordSignIn(page, EMAIL, SECOND);
  await expect(page).toHaveURL(/\/auth\/mfa/);
  await untilStepAfter(enrolledStep);
  await page.getByLabel("6-digit code").fill(code(secret));
  const signInStep = stepNow();
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // MFA off with a fresh code (FR-59; the sign-in was a moment ago, so recent).
  await page.goto("/settings#two-step");
  await page.getByRole("button", { name: "Turn off two-step sign-in" }).click();
  await untilStepAfter(signInStep);
  await page
    .getByLabel("Enter a current code to turn it off")
    .fill(code(secret));
  await page.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(
    page.getByText("Two-step sign-in is off.", { exact: false }).first(),
  ).toBeVisible();

  // Export (FR-15).
  await page.goto("/settings#your-data");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download my data" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(
    /-data-\d{4}-\d{2}-\d{2}\.json$/,
  );

  // Delete (FR-16).
  await page.goto("/settings#delete-account");
  await page.getByLabel(/Type your email to confirm/).fill(EMAIL);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Your account has been deleted.")).toBeVisible();

  expect(violations).toEqual([]);
});
