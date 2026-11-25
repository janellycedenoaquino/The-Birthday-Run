import "../rls/load-env";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { setPremium } from "../../scripts/grant-premium";
import { ownIp, passwordSignIn, watchCsp } from "./support";

// The map and route in a real browser (BUILD F-10 "Tests": D11, NFR-7, FR-30, NFR-3, NFR-6,
// FR-33, metric 2). Store and ZIP rows are this spec's own fixtures (the local DB has no import),
// removed afterwards.
const { birthdayTodayWith, createUser, groupWith, PASSWORD, sql } =
  await import("../rls/helpers");

test.use(ownIp(23));

const ZIP = "00599"; // not a real ZIP: this spec's own centroid
const NEAR = ["16-handles", "altard-state"]; // birth_month rewards: open on a birthday today
const NO_STORE = "amc-theatres";
const FAR = ["american-eagle", "ann-taylor"]; // only the Smart Grouping test enrolls these
const TILES = "https://tiles.openfreemap.org/**";

const db = sql();
test.beforeAll(async () => {
  await db`delete from public.retailer_stores where source_ref like 'e2e-route-%'`;
  await db`delete from public.zip_centroids where zip = ${ZIP}`;
  await db`insert into public.zip_centroids (zip, state, location)
           values (${ZIP}, 'NY', extensions.st_setsrid(extensions.st_makepoint(-74.006, 40.713), 4326)::extensions.geography)`;
  const stores: [string, number, number][] = [
    [NEAR[0]!, 40.72, -74.0],
    [NEAR[1]!, 40.73, -73.99],
    // A second cluster ~10 km north, for Smart Grouping (FR-29).
    [FAR[0]!, 40.81, -73.95],
    [FAR[1]!, 40.812, -73.952],
  ];
  for (const [id, lat, lng] of stores)
    await db`insert into public.retailer_stores (retailer_id, source, source_ref, name, address, city, state, location)
             values (${id}, 'atp', ${`e2e-route-${id}`}, ${`${id} test store`}, '1 Test St', 'New York', 'NY',
                     extensions.st_setsrid(extensions.st_makepoint(${lng}, ${lat}), 4326)::extensions.geography)`;
});
test.afterAll(async () => {
  await db`delete from public.retailer_stores where source_ref like 'e2e-route-%'`;
  await db`delete from public.zip_centroids where zip = ${ZIP}`;
  await db.end();
});

/** A user with a birthday today and the three programs; premium when asked. */
async function setup(page: Page, label: string, premium: boolean) {
  const user = await createUser(label);
  await birthdayTodayWith(user, [...NEAR, NO_STORE]);
  if (premium) await setPremium(db, user.email, "grant");
  await passwordSignIn(page, user.email, PASSWORD);
  await expect(page).toHaveURL(/\/rewards$/);
  return user;
}

/** Records geolocation calls; `deny` makes them fail like a refused prompt. */
const stubGeolocation = (page: Page, deny: boolean) =>
  page.addInitScript((deny) => {
    const calls: string[] = [];
    (window as unknown as { geoCalls: string[] }).geoCalls = calls;
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: (
          ok: PositionCallback,
          fail: PositionErrorCallback,
        ) => {
          calls.push("get");
          if (deny)
            fail({ code: 1, message: "denied" } as GeolocationPositionError);
          else
            ok({
              coords: { latitude: 40.71281, longitude: -74.00602 },
            } as GeolocationPosition);
        },
        watchPosition: () => calls.push("watch"),
      },
    });
  }, deny);

const route = (page: Page) => page.getByRole("region", { name: "Route" });
const geoCalls = (page: Page) =>
  page.evaluate(() => (window as unknown as { geoCalls: string[] }).geoCalls);

test("premium: ZIP start → map, numbered stops, no-pin row and one Google link (FR-30–FR-34, D11)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const csp = await watchCsp(page);
  await stubGeolocation(page, false);
  await setup(page, "e2e-route", true);
  const worker = page.waitForRequest(
    /\/vendor\/maplibre\/[\d.]+\/maplibre-gl-worker\.mjs/,
  );
  await page.goto("/rewards");
  // NFR-3: nothing asks for the location on load.
  expect(await geoCalls(page)).toEqual([]);

  const r = route(page);
  await r.getByLabel("ZIP code").fill("12345");
  await r.getByRole("button", { name: "Use ZIP" }).click();
  await expect(r.getByText("We don't recognise that ZIP code.")).toBeVisible();

  await r.getByLabel("ZIP code").fill(ZIP);
  await r.getByRole("button", { name: "Use ZIP" }).click();
  await expect(r.getByText(`Starting from ${ZIP}`)).toBeVisible();
  const stops = r.locator("ol").getByRole("listitem");
  await expect(stops).toHaveCount(2);
  await expect(r.getByText(/mi straight-line from your start/)).toBeVisible();
  await expect(r.getByRole("heading", { name: "No map pin" })).toBeVisible();
  await expect(
    r.getByRole("link", { name: "No store found nearby. Find a store" }),
  ).toHaveAttribute("rel", "noopener noreferrer");
  const link = r.getByRole("link", { name: "Open in Google Maps" });
  await expect(link).toHaveAttribute("href", new RegExp(`origin=${ZIP}`));
  await expect(
    r.getByRole("img", {
      name: "Map of 2 stops. The same stops are listed below.",
    }),
  ).toBeVisible();
  await worker; // same-origin worker (D11)
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  // Nothing to tab into inside the image; the OSM credit is a plain link outside it (NFR-6).
  await expect(page.locator(".maplibregl-canvas")).toHaveAttribute(
    "tabindex",
    "-1",
  );
  await expect(
    r.getByRole("link", { name: "© OpenStreetMap contributors" }),
  ).toBeVisible();
  expect(csp).toEqual([]);
  // NFR-6: the route view with its map has no serious or critical axe issues.
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    axe.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map(
        (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`,
      ),
  ).toEqual([]);

  // Browser location: never in the link (D10).
  await r.getByRole("button", { name: "Change" }).click();
  await r.getByRole("button", { name: "Use my location" }).click();
  await expect(r.getByText("Starting from your location")).toBeVisible();
  await expect(link).toBeVisible();
  const href = (await link.getAttribute("href")) ?? "";
  expect(href).not.toContain("origin=");
  expect(href).not.toContain("40.71");

  // Nothing kept in web storage (D10, NFR-3).
  expect(
    await page.evaluate(() => localStorage.length + sessionStorage.length),
  ).toBe(0);
});

test("tiles blocked: M-162, while the stop list and link still work (NFR-7)", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.route(TILES, (r) => r.abort());
  await setup(page, "e2e-route-tiles", true);
  await page.goto("/rewards");
  const r = route(page);
  await r.getByLabel("ZIP code").fill(ZIP);
  await r.getByRole("button", { name: "Use ZIP" }).click();
  await expect(
    r.getByText(
      "The map couldn't load. Your stops and directions below still work.",
    ),
  ).toBeVisible();
  await expect(
    r.getByRole("link", { name: "Open in Google Maps" }),
  ).toBeVisible();
  await expect(r.getByText("altard-state test store")).toBeVisible();
});

test("location denied → M-154 and the ZIP field focused (FR-30)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await stubGeolocation(page, true);
  await setup(page, "e2e-route-denied", true);
  await page.goto("/rewards");
  const r = route(page);
  await r.getByRole("button", { name: "Use my location" }).click();
  await expect(
    r.getByText("We couldn't get your location. Enter a ZIP code instead."),
  ).toBeVisible();
  await expect(r.getByLabel("ZIP code")).toBeFocused();
});

test("group route keeps the group's order; free users get C-104 (FR-33, metric 2)", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const user = await setup(page, "e2e-route-group", true);
  // The farther store first: the group's order wins over the shorter one.
  await groupWith(user, "Route run", [NEAR[1]!, NEAR[0]!]);
  await page.goto("/plan");
  const card = page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: "Route run" }) });
  await card.getByText("Show route").click();
  await card.getByLabel("ZIP code").fill(ZIP);
  await card.getByRole("button", { name: "Use ZIP" }).click();
  const stops = card.locator("details ol").getByRole("listitem");
  await expect(stops).toHaveCount(2);
  await expect(stops.first()).toContainText("Altar'd State");

  // Free: no route controls, C-104 where they would be.
  const ctx = await browser.newContext(ownIp(23));
  const free = await ctx.newPage();
  await setup(free, "e2e-route-free", false);
  await free.goto("/rewards");
  await expect(
    route(free).getByText("The map and route is part of Premium"),
  ).toBeVisible();
  await expect(route(free).getByLabel("ZIP code")).toHaveCount(0);
  await ctx.close();
});

test("Discover state filter: set a start → only that state; Show all clears; never in a URL (FR-5, NFR-3, metric 2)", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  await stubGeolocation(page, false);
  await setup(page, "e2e-state", true);
  // Listed only in other states, so hidden in NY; Tim Hortons lists NY.
  const elsewhere = page.getByRole("heading", { name: "Caribou Coffee" });
  const inNy = page.getByRole("heading", { name: "Tim Hortons" });
  const urls: string[] = [];
  page.on("request", (r) => urls.push(r.url()));

  await page.goto("/discover");
  expect(await geoCalls(page)).toEqual([]); // nothing on load (FR-5)
  await expect(elsewhere).toBeVisible();
  const filter = page.getByRole("region", { name: "Your state" });
  // The filters sit behind "More filters" (owner, 2026-11-25).
  const openFilters = async () => {
    if (!(await filter.isVisible()))
      await page.getByText("More filters").click();
  };
  await openFilters();
  await filter.getByLabel("ZIP code").fill(ZIP);
  await filter.getByRole("button", { name: "Use ZIP" }).click();
  await expect(
    page.getByText(/^Showing rewards available in NY\. [1-9]\d* hidden\.$/),
  ).toBeVisible();
  await expect(elsewhere).toHaveCount(0);
  await expect(inNy).toBeVisible();

  // Category links keep the filter (memory, not the URL).
  await page.getByRole("link", { name: /^Food & drink/ }).click();
  await expect(page).toHaveURL(/category=food_drink/);
  await expect(
    page.getByText(/^Showing rewards available in NY/),
  ).toBeVisible();
  await expect(elsewhere).toHaveCount(0);

  // "Show all" turns it off and it stays off; the start is kept, so M-172b offers it again.
  await openFilters();
  await filter.getByRole("button", { name: "Show all" }).click();
  await expect(elsewhere).toBeVisible();
  await filter.getByRole("button", { name: "Show only my state" }).click();
  await expect(elsewhere).toHaveCount(0);

  // NFR-3: neither the state nor the ZIP ever went into a URL.
  expect(urls.filter((u) => /state=|00599/.test(u))).toEqual([]);

  // Free: no state control.
  const ctx = await browser.newContext(ownIp(23));
  const free = await ctx.newPage();
  await setup(free, "e2e-state-free", false);
  await free.goto("/discover");
  await expect(
    free.getByRole("heading", { name: "Caribou Coffee" }),
  ).toBeVisible();
  await expect(free.getByRole("region", { name: "Your state" })).toHaveCount(0);
  await expect(free.getByLabel("ZIP code")).toHaveCount(0);
  await ctx.close();
});

test("Smart Grouping: two nearby pairs → Apply all creates both groups; free gets C-104 (FR-29, metric 2)", async ({
  page,
  browser,
}) => {
  test.setTimeout(90_000);
  const user = await createUser("e2e-smart");
  await birthdayTodayWith(user, [...NEAR, ...FAR, NO_STORE]);
  await setPremium(db, user.email, "grant");
  await passwordSignIn(page, user.email, PASSWORD);
  await expect(page).toHaveURL(/\/rewards$/);
  await page.goto("/plan");
  const smart = page.getByRole("region", { name: "Smart Grouping" });
  await smart.getByRole("button", { name: "Suggest groups" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("ZIP code").fill(ZIP);
  await dialog.getByRole("button", { name: "Use ZIP" }).click();
  await expect(dialog.getByRole("heading", { name: "Run 1" })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Run 2" })).toBeVisible();
  await expect(
    dialog.getByText(/^Left out \(no store location\): AMC Theatres$/),
  ).toBeVisible();

  // Cancel creates nothing.
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("heading", { name: "Run 1", exact: true }),
  ).toHaveCount(0);

  await smart.getByRole("button", { name: "Suggest groups" }).click();
  await expect(dialog.getByRole("heading", { name: "Run 1" })).toBeVisible();
  await dialog.getByRole("button", { name: "Apply all" }).click();
  await expect(dialog).toHaveCount(0);
  const groups = page.getByRole("region", { name: "Your groups" });
  const card = (name: string) =>
    groups
      .getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card("Run 1")).toBeVisible();
  await expect(card("Run 2")).toBeVisible();
  // The pairs stay together: each group holds one cluster.
  const near = card("Run 1")
    .or(card("Run 2"))
    .filter({ hasText: "16 Handles" });
  await expect(near).toContainText("Altar'd State");
  await expect(near).not.toContainText("American Eagle");

  // Free: C-104 in its place, no button.
  const ctx = await browser.newContext(ownIp(23));
  const free = await ctx.newPage();
  await setup(free, "e2e-smart-free", false);
  await free.goto("/plan");
  const freeSmart = free.getByRole("region", { name: "Smart Grouping" });
  await expect(
    freeSmart.getByText("Smart Grouping is part of Premium"),
  ).toBeVisible();
  await expect(
    free.getByRole("button", { name: "Suggest groups" }),
  ).toHaveCount(0);
  await ctx.close();
});
