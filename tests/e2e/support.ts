import { existsSync, readFileSync, rmSync } from "node:fs";
import { expect, type Locator, type Page } from "@playwright/test";

// Shared e2e helpers (BUILD CI "Test suites"): the mailbox adapter (§0.8's e2e seam), Turnstile,
// sign-in, and the CSP-console watcher.

const DEPLOYED = process.env.E2E_TARGET === "deployed";
const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54424";
const MANUAL_LINK = "playwright/.manual-link";

export type Mail = { id: string; subject: string; html: string };

/**
 * The newest email to `to` whose subject matches, from Mailpit (local, CI). A deployed run has no
 * Mailpit: `link()` asks the Builder to paste the link instead (the `manual` adapter).
 */
export async function newestMail(to: string, subject: RegExp): Promise<Mail> {
  for (let attempt = 0; attempt < 60; attempt++) {
    const search = await (
      await fetch(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
      )
    ).json();
    const hit = (search.messages ?? []).find((m: { Subject: string }) =>
      subject.test(m.Subject),
    );
    if (hit) {
      const message = await (
        await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`)
      ).json();
      return { id: hit.ID, subject: message.Subject, html: message.HTML };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email "${subject}" to ${to}`);
}

/** The /auth/confirm link of the newest matching email, as a same-origin path. */
export async function confirmLink(
  to: string,
  subject: RegExp,
): Promise<string> {
  if (DEPLOYED) return manualLink(subject.source);
  const { html } = await newestMail(to, subject);
  const href = /href="([^"]*\/auth\/confirm\?[^"]*)"/.exec(html)?.[1];
  if (!href) throw new Error(`no confirm link in "${subject}"`);
  const url = new URL(href.replaceAll("&amp;", "&"));
  return url.pathname + url.search;
}

/** Deployed run: wait up to 15 minutes for the Builder to paste the link into the file. */
async function manualLink(what: string): Promise<string> {
  rmSync(MANUAL_LINK, { force: true });
  console.log(
    `\n→ "${what}" email (check spam): copy its button's link, DON'T click it, and paste it into ${MANUAL_LINK}\n`,
  );
  for (let waited = 0; waited < 900; waited++) {
    // An editor or `cat >` creates the file before the link is in it: wait for a whole URL.
    const pasted = existsSync(MANUAL_LINK)
      ? readFileSync(MANUAL_LINK, "utf8").trim()
      : "";
    if (URL.canParse(pasted)) {
      const url = new URL(pasted);
      rmSync(MANUAL_LINK);
      return url.pathname + url.search;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`no link pasted into ${MANUAL_LINK} within 15 minutes`);
}

// A deployed run needs Cloudflare's always-pass test keys on the app for the run (README): with
// the real keys Turnstile refuses an automated browser, even when a person ticks the box.
export async function waitForTurnstile(page: Page) {
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(
    /.+/,
    {
      timeout: 20_000,
    },
  );
}

export async function passwordSignIn(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.locator('input[name="password"]').fill(password);
  await waitForTurnstile(page);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Collects CSP violations for the whole page's life (NFR-13). */
export async function watchCsp(page: Page): Promise<string[]> {
  const found: string[] = [];
  await page.addInitScript(() =>
    document.addEventListener("securitypolicyviolation", (e) =>
      console.log(
        `CSP-VIOLATION ${e.effectiveDirective} ${e.blockedURI} @${location.pathname}`,
      ),
    ),
  );
  page.on("console", (m) => {
    if (m.text().startsWith("CSP-VIOLATION")) found.push(m.text());
  });
  return found;
}

/**
 * After S-9's "Save password", a brand-new user lands on onboarding with the M-27 notice carried
 * along (decision 0009), then S-101: step 1 Jun 15 and the detected zone, step 2 skipped (FR-6, FR-7).
 */
export async function completeOnboarding(page: Page) {
  await expect(page).toHaveURL(/\/onboarding$/);
  await expect(page.getByText("You're all set.")).toBeVisible();
  await page.getByLabel("Month").selectOption("6");
  await page.getByLabel("Day").selectOption("15");
  await page.getByRole("button", { name: "Continue" }).click();
  // Step 2 (programs): skipped here; tests/e2e/onboarding.spec.ts picks some.
  await expect(
    page.getByRole("heading", { name: "Which programs are you in?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  // The finish card (owner, 2026-11-25), then on to My Rewards (decision 0018).
  await expect(page).toHaveURL(/\/onboarding\?done=1$/);
  await expect(
    page.getByRole("heading", { name: "You're all set!" }),
  ).toBeVisible();
  await expect(
    page.getByText("No programs yet. Add them any time from Rewards."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Go to My Rewards" }).click();
  await expect(page).toHaveURL(/\/rewards$/);
}

/**
 * Per-spec client IP for the local e2e run: the limiter keys sign-ins on the first
 * `x-forwarded-for` value (BUILD §0.4), so each spec file gets its own documentation-range address
 * (RFC 5737) and its own budget, instead of the whole suite sharing one. Use as
 * `test.use(ownIp(n))` with a number unique to the file. In production Vercel overwrites the
 * header, so this changes nothing there, and the real per-IP limit still applies in each spec.
 */
export const ownIp = (n: number) => ({
  extraHTTPHeaders: { "x-forwarded-for": `198.51.100.${n}` },
});

/** Month and day `plusDays` from now in `zone`, for setting a test user's birthday. */
export function monthDayIn(zone: string, plusDays = 0) {
  const now = new Date(Date.now() + plusDays * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return { month: get("month"), day: get("day") };
}

/** C-108: checks the title and that "Cancel" has focus, then confirms with "Delete". */
export async function confirmDelete(page: Page, title: string) {
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByRole("heading", { name: title })).toBeVisible();
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await confirm.getByRole("button", { name: "Delete" }).click();
}

/** A Mailpit message's headers, each as a list of values (F-12's List-Unsubscribe check). */
export async function mailHeaders(
  id: string,
): Promise<Record<string, string[]>> {
  return (await fetch(`${MAILPIT}/api/v1/message/${id}/headers`)).json();
}

/** S-10: enter a two-step code and verify; signed in, the user lands on My Rewards. */
export async function verifyTwoStep(page: Page, code: string) {
  await page.getByLabel("6-digit code").fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL(/\/rewards$/);
}

/** S-108: turn two-step sign-in off; `code` runs after `beforeCode` (a wait for a fresh step). */
export async function turnOffTwoStep(
  page: Page,
  code: () => string,
  beforeCode: () => Promise<void> = async () => {},
) {
  await page.goto("/settings#two-step");
  await page.getByRole("button", { name: "Turn off two-step sign-in" }).click();
  await beforeCode();
  await page.getByLabel("Enter a current code to turn it off").fill(code());
  await page.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(
    page.getByText("Two-step sign-in is off.", { exact: false }).first(),
  ).toBeVisible();
}

/** S-108 "Download my data" (FR-15): the download it starts. */
export async function downloadMyData(page: Page) {
  await page.goto("/settings#your-data");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download my data" }).click(),
  ]);
  return download;
}

/** Opens a "⋯" menu (decision 0016; a <details>, so it's found by its label, not as a button). */
export async function openMore(scope: Page | Locator, label: string) {
  const summary = scope.getByLabel(label, { exact: true });
  const open = await summary.evaluate(
    (el) => (el.parentElement as HTMLDetailsElement).open,
  );
  if (!open) await summary.click();
}

/**
 * Opens an emailed /auth/confirm link and answers S-113 "Is this you?" (decision 0026): checks
 * the masked email is the expected account's, then taps the answer. Nothing is signed in before.
 */
export async function openEmailLink(
  page: Page,
  path: string,
  email: string,
  answer: "yes" | "no" = "yes",
) {
  await page.goto(path);
  await expect(page).toHaveURL(/\/auth\/is-this-you$/);
  await expect(
    page.getByRole("heading", { name: "Is this you?" }),
  ).toBeVisible();
  const at = email.lastIndexOf("@");
  await expect(
    page.getByText(`${Array.from(email)[0]}•••${email.slice(at)}`, {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: answer === "yes" ? "Yes, that's me" : "No, it's not me",
    })
    .click();
}
