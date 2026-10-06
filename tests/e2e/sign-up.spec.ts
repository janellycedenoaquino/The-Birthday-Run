import { expect, test, type Page } from "@playwright/test";

// The sign-up journey in a real browser (BUILD F-6 "Tests": FR-1, FR-2, NFR-12, NFR-13): the built
// app against local Supabase, emails read from Mailpit. Turnstile runs with Cloudflare's
// always-pass test site key from the local env (D4). #22 adds CI and the full FR-39 journey.

const MAILPIT = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const PASSWORD = "a-long-e2e-password-1";
const uniqueEmail = (label: string) =>
  `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;

async function watchCsp(page: Page) {
  const found: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      console.log(
        `CSP-VIOLATION ${e.effectiveDirective} ${e.blockedURI} @${location.pathname} ${e.sample} ${e.sourceFile}`,
      ),
    );
  });
  page.on("console", (m) => {
    if (m.text().startsWith("CSP-VIOLATION")) found.push(m.text());
  });
  return found;
}

/** The newest email's /auth/confirm link, as a same-origin path (the email carries GoTrue's site_url). */
async function confirmPath(email: string): Promise<string> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await (
      await fetch(
        `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`,
      )
    ).json();
    if (search.messages?.length) {
      const message = await (
        await fetch(`${MAILPIT}/api/v1/message/${search.messages[0].ID}`)
      ).json();
      const href = /href="([^"]*\/auth\/confirm\?[^"]*)"/.exec(
        message.HTML,
      )?.[1];
      if (!href) throw new Error("no confirm link");
      const url = new URL(href.replaceAll("&amp;", "&"));
      return url.pathname + url.search;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no email to ${email}`);
}

async function submitSignUp(page: Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Email", { exact: true }).fill(email);
  // Cloudflare's test key solves itself; wait for its token so the submit carries one.
  await expect(page.locator('input[name="cf-turnstile-response"]')).toHaveValue(
    /.+/,
    {
      timeout: 20_000,
    },
  );
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Check your email" }),
  ).toBeVisible();
}

test("sign up → confirm by email → set password → dashboard, then sign out (FR-1, FR-2)", async ({
  page,
}) => {
  const violations = await watchCsp(page);
  const email = uniqueEmail("journey");

  await submitSignUp(page, email);
  await expect(page.getByText(`We've sent a link to ${email}.`)).toBeVisible();

  // The link signs the owner in; the guard sends a password-less account to S-9.
  const link = await confirmPath(email);
  await page.goto(link);
  await expect(page).toHaveURL(/\/auth\/set-password/);
  await expect(
    page.getByRole("heading", { name: "Choose a password" }),
  ).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Save password" }).click();
  await expect(page).toHaveURL(/\/dashboard$/); // the notice leaves the URL once shown
  await expect(page.getByText("You're all set.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible();
  // C-1 always shows the signed-in email (D24.9).
  await expect(page.getByRole("button", { name: email })).toBeVisible();

  // The same link again: used up → S-8.
  await page.goto(link);
  await expect(page).toHaveURL(/\/auth\/error\?reason=link/);
  await expect(
    page.getByRole("heading", { name: "That link didn't work" }),
  ).toBeVisible();

  // Sign out from the account menu.
  await page.getByRole("button", { name: email }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Sign in" }),
  ).toBeVisible();

  expect(violations).toEqual([]);
});

test("an existing email gets the same answer as a new one (NFR-12)", async ({
  page,
}) => {
  const email = uniqueEmail("existing");
  await submitSignUp(page, email);
  const first = await page
    .getByRole("heading", { name: "Check your email" })
    .locator("..")
    .innerText();

  await submitSignUp(page, email); // now the account exists
  const second = await page
    .getByRole("heading", { name: "Check your email" })
    .locator("..")
    .innerText();
  expect(second).toBe(first);
});

test("a signed-out visit to a protected page goes to sign-in (FR-2)", async ({
  request,
}) => {
  const response = await request.get("/dashboard", { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  expect(response.headers().location).toMatch(/\/sign-in\?next=%2Fdashboard$/);
});

test("a broken or foreign link lands on S-8, never a raw error", async ({
  page,
}) => {
  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=signup");
  await expect(page).toHaveURL(/\/auth\/error\?reason=link/);
  await page.goto("/auth/confirm?token_hash=x&type=email_change");
  await expect(page).toHaveURL(/\/auth\/error\?reason=link/);
});
