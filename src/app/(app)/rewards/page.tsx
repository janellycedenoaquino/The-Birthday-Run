import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { DaysLeftBadge } from "@/components/rewards/days-left-badge";
import { PickupDialog } from "@/components/rewards/pickup-dialog";
import { UndoBar } from "@/components/rewards/undo-bar";
import { RetailerLogo } from "@/components/retailers/retailer-logo";
import { Button } from "@/components/ui/button";
import {
  formatDate,
  compareDates,
  pickupDateRange,
  rewardDays,
  timingOf,
  today,
  windowFor,
  type LocalDate,
} from "@/lib/birthday/timing";
import { msg } from "@/lib/messages";
import { joinByLine, timingLabel } from "@/lib/retailers/labels";
import { UpgradePrompt } from "@/components/billing/upgrade-prompt";
import { RewardsRoute } from "@/components/map/rewards-route";
import {
  availableRewards,
  myRewards,
  type RewardItem,
} from "@/lib/rewards/my-rewards";
import { createPickup, deletePickup } from "@/server/actions/pickups";
import { findStops, lookupZip } from "@/server/actions/route";
import { getEntitlement } from "@/server/premium/entitlement";
import { requireOnboarded } from "@/server/auth/app-guards";

// S-105 My Rewards (SPEC §3.3, BUILD F-4: FR-12–FR-16). `onboarded` level. The rules live in
// src/lib/rewards/my-rewards.ts; this page loads rows and renders. The Route section is premium
// (FR-32, BUILD F-10); free users get C-104 there. The report menu (F-13) arrives later.
export const metadata: Metadata = {
  title: "My Rewards",
  robots: { index: false },
};

const searchSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  within: z.enum(["1", "7", "14"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(50).catch(1),
});

const RETAILER_COLUMNS =
  "id, name, reward_description, logo_file, timing_type, days_before, days_after, signup_lead_days";

export default async function RewardsPage({
  searchParams,
}: PageProps<"/rewards">) {
  const { supabase, profile } = await requireOnboarded();
  const filters = searchSchema.parse(await searchParams);
  const { data, error } = await supabase
    .from("enrollments")
    .select(`retailer:retailers!inner(${RETAILER_COLUMNS})`)
    .is("retailer.retired_at", null);
  if (error) throw new Error("S-105: could not read rewards", { cause: error });

  const now = today(profile.timeZone, new Date());
  const enrolled = data.map((row) => row.retailer);
  // Only pickups that can count: on or after the planning cycle's start (decision 0008).
  const cycleStart = windowFor(profile.birthday, enrolled.map(timingOf), now)
    .planning.cycleStart;
  const { data: pickups, error: pError } = await supabase
    .from("pickups")
    .select("retailer_id, picked_up_on")
    .gte("picked_up_on", cycleStart);
  if (pError)
    throw new Error("S-105: could not read pickups", { cause: pError });
  const picked = pickups.map((p) => ({
    retailerId: p.retailer_id,
    date: p.picked_up_on as LocalDate,
  }));
  const r = myRewards({
    birthday: profile.birthday,
    today: now,
    enrolled,
    pickups: picked,
    filters: {
      q: filters.q,
      within: filters.within
        ? (Number(filters.within) as 1 | 7 | 14)
        : undefined,
      page: filters.page,
    },
  });
  const w = r.window;
  const { premium } = await getEntitlement(supabase);
  // FR-32: every available reward, most urgent first, whatever the list's filters (premium only:
  // free pages carry no route data, FR-39).
  const routeRewards =
    premium && r.view === "list"
      ? availableRewards({
          birthday: profile.birthday,
          today: now,
          enrolled,
          pickups: picked,
        }).open.map(({ id, name }) => ({ id, name }))
      : [];
  // In the list view the window is open, so the pickup date range exists (FR-17).
  const range = pickupDateRange(w);
  const name = profile.displayName;
  const heading = {
    birthday: name ? msg("M-201").replace("{name}", name) : msg("M-201b"),
    birth_month: name ? msg("M-202").replace("{name}", name) : msg("M-202b"),
    window_open: msg("M-203"),
    other: msg("M-204"),
  }[r.header];
  const query = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const all = { q: filters.q, within: filters.within, ...over };
    for (const [k, v] of Object.entries(all)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/rewards?${s}` : "/rewards";
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold">{heading}</h1>
      {w.dayNumber < 0 ? (
        <p className="mt-1 text-muted-foreground">
          {w.daysUntilBirthday === 1
            ? msg("M-206")
            : msg("M-205").replace("{days}", String(w.daysUntilBirthday))}
        </p>
      ) : null}

      {/* FR-18: recent pickups with "Undo", kept outside the list (the card leaves it at once). */}
      <UndoBar deletePickup={deletePickup} />

      {r.view === "none" ? (
        <Notice text={msg("M-211")} />
      ) : r.view === "outside" ? (
        <Notice
          text={msg("M-207").replace(
            "{date}",
            formatDate(w.planning.start, "long"),
          )}
        />
      ) : r.view === "done" ? (
        <p className="mt-8 rounded-lg border border-border/70 p-6">
          {msg("M-212")}
        </p>
      ) : (
        <>
          <form
            method="get"
            className="mt-8 flex flex-wrap items-end gap-3"
            role="search"
          >
            <div className="grid gap-1">
              <label htmlFor="rewards-q" className="text-sm">
                Search rewards
              </label>
              <input
                id="rewards-q"
                name="q"
                type="search"
                defaultValue={filters.q ?? ""}
                maxLength={100}
                className="h-11 w-56 rounded-md border border-input bg-background px-3 text-base"
              />
            </div>
            <div className="grid gap-1">
              <label htmlFor="rewards-within" className="text-sm">
                Ends within
              </label>
              <select
                id="rewards-within"
                name="within"
                defaultValue={filters.within ?? ""}
                className="h-11 rounded-md border border-input bg-background px-3 text-base"
              >
                <option value="">Any time</option>
                <option value="1">Within 1 day</option>
                <option value="7">Within 7 days</option>
                <option value="14">Within 14 days</option>
              </select>
            </div>
            <Button type="submit" size="lg" variant="outline">
              Apply
            </Button>
          </form>
          <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
            {msg("M-178")
              .replace("{shown}", String(r.matched))
              .replace("{total}", String(r.available))}
          </p>
          {r.items.length === 0 ? (
            <div className="mt-6 rounded-lg border border-border/70 p-6">
              <p>{msg("M-179")}</p>
              <Link
                href="/rewards"
                className="mt-2 inline-block underline underline-offset-4"
              >
                Clear filters
              </Link>
            </div>
          ) : (
            <ul className="mt-6 grid gap-4">
              {r.items.map((item) => (
                <RewardCard
                  key={item.id}
                  item={item}
                  range={{
                    // Not before this reward itself opened (FR-17; createPickup checks again).
                    min: latest(
                      range!.min,
                      rewardDays(timingOf(item), w.planning.birthday).opens,
                    ),
                    max: range!.max,
                  }}
                  joinBy={
                    item.signup_lead_days && w.dayNumber < 0
                      ? joinByLine({
                          brand: item.name,
                          leadDays: item.signup_lead_days,
                          nextBirthday: w.nextBirthday,
                          today: now,
                        })
                      : null
                  }
                />
              ))}
            </ul>
          )}
          {r.hasMore ? (
            <div className="mt-6">
              {/* A plain link: the next page renders the first n+1 pages, so no client state. */}
              <Button asChild variant="outline" size="lg">
                <Link
                  href={query({ page: String(filters.page + 1) })}
                  scroll={false}
                >
                  {msg("M-209")}
                </Link>
              </Button>
            </div>
          ) : null}
          <section aria-labelledby="route-heading" className="mt-12 grid gap-4">
            <h2 id="route-heading" className="text-xl font-semibold">
              {msg("M-210")}
            </h2>
            {premium ? (
              <RewardsRoute
                rewards={routeRewards}
                findStops={findStops}
                lookupZip={lookupZip}
              />
            ) : (
              <UpgradePrompt supabase={supabase} feature="M-132" />
            )}
          </section>
        </>
      )}
    </div>
  );
}

const latest = (a: LocalDate, b: LocalDate) =>
  compareDates(a, b) >= 0 ? a : b;

/** FR-15 / FR-16: a message with the way forward: Discover and Plan. */
function Notice({ text }: { text: string }) {
  return (
    <div className="mt-8 grid gap-4 rounded-lg border border-border/70 p-6">
      <p>{text}</p>
      <div>
        <Button asChild size="lg">
          <Link href="/discover">Browse Discover</Link>
        </Button>
        <Button asChild size="lg" variant="outline" className="ml-2">
          <Link href="/plan">Start planning</Link>
        </Button>
      </div>
    </div>
  );
}

function RewardCard({
  item,
  joinBy,
  range,
}: {
  item: RewardItem;
  joinBy: string | null;
  range: { min: string; max: string };
}) {
  return (
    <li className="flex gap-4 rounded-lg border border-border/70 p-4">
      <RetailerLogo name={item.name} logoFile={item.logo_file} />
      <div className="grid min-w-0 gap-1">
        <h2 className="font-semibold">
          <Link
            href={`/discover/${item.id}`}
            className="underline-offset-4 hover:underline"
          >
            {item.name}
          </Link>
        </h2>
        <p>{item.reward_description}</p>
        <p className="text-sm text-muted-foreground">
          {timingLabel(timingOf(item))}
        </p>
        {joinBy ? <p className="text-sm">{joinBy}</p> : null}
        <DaysLeftBadge daysLeft={item.daysLeft} />
        <div className="mt-2">
          <PickupDialog
            retailerId={item.id}
            retailer={item.name}
            minDate={range.min}
            maxDate={range.max}
            createPickup={createPickup}
          />
        </div>
      </div>
    </li>
  );
}
