import "../rls/load-env";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { ownIp } from "./support";
import { appConfig } from "../../src/config/app";

const { sql } = await import("../rls/helpers");

// Its own client IP, so sign-ins don't share one per-IP budget (support.ts ownIp).
test.use(ownIp(15));

// The public pages (BUILD F-3 "Tests": FR-17, FR-20, FR-23, FR-24, FR-25, NFR-13, NFR-23): each
// renders with 0 CSP violations, no serious axe issue, and no sideways scroll at 360 px.
const PAGES: [string, number][] = [
  ["/", 200],
  ["/privacy", 200],
  ["/terms", 200],
  ["/no-such-page", 404],
  ["/sign-in", 200],
  ["/sign-up", 200],
  ["/forgot-password", 200],
];

for (const [path, status] of PAGES) {
  test(`${path}: ${status}, 0 CSP violations, axe clean, fits 360 px`, async ({
    page,
  }) => {
    const violations: string[] = [];
    await page.addInitScript(() =>
      document.addEventListener("securitypolicyviolation", (e) =>
        console.log(`CSP-VIOLATION ${e.effectiveDirective} ${e.blockedURI}`),
      ),
    );
    page.on("console", (m) => {
      if (m.text().startsWith("CSP-VIOLATION")) violations.push(m.text());
    });
    await page.setViewportSize({ width: 360, height: 740 });
    const response = await page.goto(path);
    expect(response?.status()).toBe(status);
    await page.waitForLoadState("load");

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      // Cloudflare's challenge frame is theirs to fix; our own markup is what's checked here.
      .exclude('iframe[src*="challenges.cloudflare.com"]')
      .analyze();
    expect(
      axe.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => v.id),
    ).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(0);
    expect(violations).toEqual([]);
  });
}

test("S-2 and S-3 have the app's text, no placeholder banner; privacy lists the providers and retention (FR-17)", async ({
  page,
}) => {
  for (const path of ["/privacy", "/terms"]) {
    await page.goto(path);
    await expect(
      page.getByText("Placeholder text. Replace this page before launch."),
    ).toHaveCount(0);
  }
  await page.goto("/privacy");
  for (const provider of [
    "Supabase",
    "Vercel",
    "Resend",
    "Cloudflare Turnstile",
    "Sentry",
    "Google",
    "OpenFreeMap",
    "GitHub",
    "Stripe",
  ])
    await expect(
      page.getByRole("main").getByText(provider, { exact: false }).first(),
    ).toBeVisible();
  await expect(
    page.getByText("Backup copies are kept for up to 30 days"),
  ).toBeVisible();
  await expect(
    page.getByText("keeps a security log of account activity"),
  ).toBeVisible();
  await expect(page.getByText("We don't store your location.")).toBeVisible();
  await page.goto("/terms");
  for (const text of [
    "The brand's own terms always win.",
    "Data from OpenStreetMap contributors",
    "All The Places (CC0)",
    "CDLA Permissive 2.0",
  ])
    await expect(
      page.getByRole("main").getByText(text, { exact: false }),
    ).toBeVisible();
});

test("titles follow '{Page} · {name}' (FR-24)", async ({ page }) => {
  await page.goto("/privacy");
  await expect(page).toHaveTitle(`Privacy policy · ${appConfig.name}`);
  await page.goto("/");
  await expect(page).toHaveTitle(appConfig.name);
});

test("metadata routes: manifest, robots, sitemap, OG image, icons (FR-24, FR-25)", async ({
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest).toMatchObject({
    name: appConfig.name,
    short_name: appConfig.shortName,
    theme_color: appConfig.brand.primary,
    display: "standalone",
  });
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
  }
  // Not production here, so nothing is indexable (D19 previews, local).
  expect(await (await request.get("/robots.txt")).text()).toContain(
    "Disallow: /",
  );
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const path of ["/discover", "/privacy", "/terms"])
    expect(sitemap).toContain(`${path}</loc>`);
  expect(sitemap).not.toContain("/dashboard");
  // Every non-retired retailer, popular or not, and no retired one (decision 0017).
  const db = sql();
  const live = await db<{ id: string }[]>`
    select id from public.retailers where retired_at is null`;
  const retired = await db<{ id: string }[]>`
    select id from public.retailers where retired_at is not null`;
  await db.end();
  expect(live.length).toBeGreaterThan(0);
  for (const { id } of live) expect(sitemap).toContain(`/discover/${id}</loc>`);
  for (const { id } of retired)
    expect(sitemap).not.toContain(`/discover/${id}</loc>`);
  const og = await request.get("/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toBe("image/png");
});
