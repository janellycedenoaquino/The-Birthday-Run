import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { appConfig } from "../../src/config/app";

// The shell in a real browser (BUILD F-3 tests for FR-20, FR-21, NFR-23; F-2's CSP-console check,
// NFR-13) and week-1 check 1 for Sonner and next-themes (D5, decision 0011).

type Violation = { directive: string; blocked: string; sample: string };

async function collectViolations(page: Page) {
  await page.addInitScript(() => {
    const list: unknown[] = [];
    (window as unknown as { __csp: unknown[] }).__csp = list;
    document.addEventListener("securitypolicyviolation", (e) =>
      list.push({
        directive: e.effectiveDirective,
        blocked: e.blockedURI,
        sample: e.sample,
      }),
    );
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __csp: Violation[] }).__csp,
    ) as Promise<Violation[]>;
}

const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

// HTML-only checks (no browser needed, tagged @html): what the server sends.
for (const [path, status] of [
  ["/", 200],
  ["/no-such-page", 404],
] as const) {
  test(`@html ${path}: every <script> and <style> carries this response's nonce`, async ({
    request,
  }) => {
    const response = await request.get(path);
    expect(response.status()).toBe(status);
    const nonce = nonceOf(response.headers()["content-security-policy"] ?? "");
    expect(nonce).toBeTruthy();
    const html = await response.text();

    const tags = [...html.matchAll(/<(script|style)\b[^>]*>/g)].map(
      (m) => m[0],
    );
    expect(tags.some((t) => t.startsWith("<style"))).toBe(true); // brand style
    expect(tags.filter((t) => t.startsWith("<script")).length).toBeGreaterThan(
      1,
    );
    for (const tag of tags) expect(tag).toContain(`nonce="${nonce}"`);

    // Brand tokens (D16) and next-themes' no-flash script (FR-21) are in the page.
    expect(html).toContain(`:root:root{--primary:${appConfig.brand.primary};`);
    // (Matched by what it does, not its minified variable names, which change between builds.)
    expect(html).toMatch(
      new RegExp(`<script nonce="${nonce}">[^<]*localStorage\\.getItem`),
    );
  });
}

test("@html footer links and support mailto on the page (FR-17)", async ({
  request,
}) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain('href="/privacy"');
  expect(html).toContain('href="/terms"');
  expect(html).toContain(`href="mailto:${appConfig.supportEmail}"`);
});

for (const scheme of ["light", "dark"] as const) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    test("no CSP violations; themes and brand applied with the nonce", async ({
      page,
    }) => {
      const violations = await collectViolations(page);
      const response = await page.goto("/");
      const csp = response?.headers()["content-security-policy"] ?? "";
      const nonce = nonceOf(csp);
      expect(nonce).toBeTruthy();
      // Not "networkidle": Chromium keeps the link prefetches of pages that don't exist yet
      // (404) open, so it never settles. Wait for what the check is about: Sonner's stylesheet.
      await page.waitForFunction(() =>
        [...document.querySelectorAll("style")].some((s) =>
          s.textContent?.includes("[data-sonner-toaster]"),
        ),
      );

      // next-themes: its no-flash script carries the request's nonce and set the class (FR-21).
      const themeScriptNonces = await page.$$eval("script", (scripts) =>
        scripts
          .filter((s) => s.textContent?.includes("localStorage"))
          .map((s) => s.nonce),
      );
      expect(themeScriptNonces).toEqual([nonce]);
      await expect(page.locator("html")).toHaveClass(
        scheme === "dark" ? /\bdark\b/ : /\blight\b/,
      );

      // Brand <style> (D16): nonce'd and applied.
      const primary = await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--primary")
          .trim(),
      );
      expect(primary).toBe(
        scheme === "dark"
          ? appConfig.brand.primaryDark
          : appConfig.brand.primary,
      );

      // Sonner mounted its toaster region (C-3).
      await expect(
        page.locator("section[aria-label^='Notifications']"),
      ).toHaveCount(1);

      const found = await violations();
      test.info().annotations.push({
        type: "csp-violations",
        description: JSON.stringify(found),
      });
      expect(found).toEqual([]);
    });

    test("axe: no serious or critical issues, contrast included (NFR-23)", async ({
      page,
    }) => {
      await page.goto("/");
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      const serious = results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`);
      expect(serious).toEqual([]);
    });
  });
}

test("no horizontal scroll at 360 px (FR-20)", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the theme select switches and persists the theme (FR-21)", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Theme").selectOption("dark");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await expect(page.getByLabel("Theme")).toHaveValue("dark");
});
